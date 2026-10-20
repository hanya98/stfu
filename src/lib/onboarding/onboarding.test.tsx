import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import OnboardingPage from "@/app/onboarding/page";
import { createDefaultRecord, PREPARATION_GOALS } from "./types";
import { generateStudyPlan } from "./schedule";
import { loadOnboardingRecord, parseOnboardingRecord, saveOnboardingRecord } from "./storage";
import { validateStep, validateImportedTopics } from "./validation";
import { loadPlannerRecord } from "@/lib/planner/storage";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("onboarding validation", () => {
  it("requires at least one valid goal and a description for custom goals", () => {
    const record = createDefaultRecord();
    expect(validateStep(1, record.answers).valid).toBe(false);
    record.answers.goals = ["Custom goal"];
    expect(validateStep(1, record.answers).message).toContain("Describe your custom");
    record.answers.customGoal = "Prepare for an interview";
    expect(validateStep(1, record.answers).valid).toBe(true);
    record.answers.goals = [PREPARATION_GOALS[0]];
    expect(validateStep(1, record.answers).valid).toBe(true);
  });

  it("rejects impossible availability, malformed dates, and out-of-range problem targets", () => {
    const { answers } = createDefaultRecord();
    answers.minutesPerDay = 0;
    expect(validateStep(3, answers).message).toContain("15 and 480");
    answers.minutesPerDay = 60;
    answers.weeklyProblemTarget = 201;
    expect(validateStep(3, answers).message).toContain("1 and 200");
    answers.weeklyProblemTarget = 12;
    answers.targetCompletionDate = "2026-02-30";
    expect(validateStep(3, answers, new Date(2026, 0, 1)).message).toContain("target date");
    answers.targetCompletionDate = "2025-12-31";
    expect(validateStep(3, answers, new Date(2026, 0, 1)).valid).toBe(false);
  });

  it("validates imported metadata and only accepts http(s) external links", () => {
    const unsafe = validateImportedTopics([{ name: "Trees", links: [{ title: "Problem", url: "javascript:alert(1)" }] }]);
    expect(unsafe.valid).toBe(false);
    const valid = validateImportedTopics([{ name: "My topic", estimatedMinutes: 45, links: [{ title: "Official", url: "https://example.org/problem" }] }]);
    expect(valid.valid).toBe(true);
  });
});

describe("study plan generation", () => {
  it("estimates remaining topics, difficulty workload, weekly sessions, and deadline feasibility", () => {
    const { answers } = createDefaultRecord();
    answers.studiedTopics = ["Programming basics", "Complexity analysis"];
    answers.targetCompletionDate = "2026-01-02";
    answers.studyDays = [5];
    answers.minutesPerDay = 15;
    const plan = generateStudyPlan(answers, new Date(2026, 0, 2));
    expect(plan.topics.some((topic) => topic.name === "Programming basics")).toBe(false);
    expect(plan.estimatedWorkloadMinutes).toBeGreaterThan(0);
    expect(plan.availableMinutesUntilDeadline).toBe(15);
    expect(plan.feasibleByDeadline).toBe(false);
    expect(plan.weeklySprint).toHaveLength(1);
    expect(plan.weeklySprint[0].dayLabel).toBe("Friday");
  });

  it("returns a lower workload when all roadmap topics have already been studied", () => {
    const { answers } = createDefaultRecord();
    answers.studiedTopics = [...answers.selectedTopics];
    expect(generateStudyPlan(answers).estimatedWorkloadMinutes).toBe(0);
  });
});

describe("local onboarding persistence", () => {
  beforeEach(() => { window.localStorage.clear(); push.mockReset(); });

  it("safely parses, saves, and reloads a single versioned record", () => {
    const record = createDefaultRecord();
    record.answers.goals = ["Internship preparation"];
    record.answers.studyDays = [];
    record.answers.minutesPerDay = 0;
    const result = saveOnboardingRecord(record);
    expect(result.ok).toBe(true);
    expect(loadOnboardingRecord()?.answers.goals).toEqual(["Internship preparation"]);
    expect(loadOnboardingRecord()?.answers.studyDays).toEqual([]);
    expect(parseOnboardingRecord("not json")).toBeNull();
    expect(parseOnboardingRecord(JSON.stringify({ version: 1, answers: {} }))).toBeNull();
    expect(window.localStorage.length).toBe(1);
  });

  it("returns a useful error when browser storage is unavailable", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage disabled"); });
    const result = saveOnboardingRecord(createDefaultRecord());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("could not save");
    setItem.mockRestore();
  });

  it("migrates the earlier demo onboarding answers without losing basic preferences", () => {
    window.localStorage.setItem("planly-onboarding", JSON.stringify({ goal: "Software engineering role", level: "Intermediate", language: "Python", minutes: "45", days: "4", roadmap: "Striver A2Z DSA" }));
    const migrated = loadOnboardingRecord();
    expect(migrated?.answers.goals).toEqual(["Software engineering placements"]);
    expect(migrated?.answers.experience).toBe("Some practice");
    expect(migrated?.answers.minutesPerDay).toBe(45);
    expect(migrated?.answers.studyDays).toHaveLength(4);
    expect(window.localStorage.getItem("planly-onboarding-v1")).not.toBeNull();
    expect(window.localStorage.getItem("planly-onboarding")).toBeNull();
  });

  it("supports next, back, preserving selections, and resuming a saved step", async () => {
    const { unmount } = render(<OnboardingPage/>);
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("What are you preparing for?")).toBeTruthy();
    const goal = screen.getByRole("button", { name: /Internship preparation/ });
    fireEvent.click(goal);
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Tell us about your DSA experience.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(await screen.findByRole("button", { name: /Internship preparation/ })).toHaveAttribute("aria-pressed", "true");
    const saved = loadOnboardingRecord();
    expect(saved?.answers.goals).toContain("Internship preparation");

    unmount();
    window.localStorage.clear();
    const resume = createDefaultRecord(); resume.currentStep = 3;
    saveOnboardingRecord(resume);
    render(<OnboardingPage/>);
    await waitFor(() => expect(screen.getByText("What does a realistic week look like?")).toBeTruthy());
  });

  it("confirms the proposed plan once, stores preferences, and routes to the dashboard", async () => {
    render(<OnboardingPage/>);
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Software engineering placements/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Continue/ }));
    expect(await screen.findByText("Here’s a first sprint to get you moving.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Confirm plan/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Finish & open dashboard/ }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
    expect(loadOnboardingRecord()?.completed).toBe(true);
    expect(loadOnboardingRecord()?.answers.goals).toEqual(["Software engineering placements"]);
    expect(loadPlannerRecord().tasks.length).toBeGreaterThan(0);
  });
});
