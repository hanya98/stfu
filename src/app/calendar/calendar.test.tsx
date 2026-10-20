import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Calendar from "./page";
import { loadPlannerRecord, PLANNER_STORAGE_KEY } from "@/lib/planner/storage";
import { loadRoadmapProgress } from "@/lib/roadmap/progress";
import { createDefaultRecord } from "@/lib/onboarding/types";
import { saveOnboardingRecord, loadOnboardingRecord } from "@/lib/onboarding/storage";
import { SPRINTS_STORAGE_KEY } from "@/lib/planner/sprints";
import { localDayKey } from "@/lib/planner/engine";

describe("calendar and sprint integration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: "", tasks: [
      { id: "problem-a@2026-10-19", problemId: "problem-a", date: "2026-10-19", title: "Calendar demo problem", chapter: "Arrays", section: "Fundamentals", minutes: 30, status: "planned", url: null, kind: "practice" },
      { id: "problem-b@2026-10-20", problemId: "problem-b", date: "2026-10-20", title: "Calendar revision", chapter: "Arrays", section: "Fundamentals", minutes: 20, status: "planned", url: null, kind: "revision" },
    ] }));
  });
  it("shows saved tasks, allows completing and rescheduling the existing record", async () => {
    render(<Calendar/>);
    expect(await screen.findByText("Calendar demo problem")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Complete Calendar demo problem" }));
    await waitFor(() => expect(loadPlannerRecord().tasks[0].status).toBe("completed"));
    fireEvent.click(screen.getByRole("button", { name: "Reschedule Calendar revision" }));
    fireEvent.change(screen.getByLabelText("New date"), { target: { value: "2026-10-22" } });
    await waitFor(() => expect(loadPlannerRecord().tasks.find((task) => task.problemId === "problem-b")?.date).toBe("2026-10-22"));
    expect(loadPlannerRecord().tasks).toHaveLength(2);
  }, 15000);
  it("switches calendar views and retains week navigation", async () => {
    render(<Calendar/>);
    await screen.findByText("Calendar demo problem");
    fireEvent.click(screen.getByRole("button", { name: "Month" }));
    expect(screen.getByRole("group", { name: "Calendar view" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    expect(screen.getByText("Calendar revision")).toBeTruthy();
  });

  it("completes a revision without marking a new roadmap solve", async () => {
    render(<Calendar/>);
    await screen.findByText("Calendar demo problem");
    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    fireEvent.click(screen.getByRole("button", { name: "Complete Calendar revision" }));
    await waitFor(() => expect(loadPlannerRecord().tasks.find((task) => task.problemId === "problem-b")?.status).toBe("completed"));
    expect(loadRoadmapProgress().problems["problem-b"]?.status).toBeUndefined();
  });

  it("recovers overdue work gradually, adjusts sprint targets, extends the deadline, and can dismiss without losing tasks", async () => {
    const onboarding = createDefaultRecord();
    onboarding.completed = true;
    onboarding.answers.studyDays = [0, 1, 2, 3, 4, 5, 6];
    onboarding.answers.minutesPerDay = 120;
    onboarding.answers.weeklyProblemTarget = 8;
    const deadline = new Date(); deadline.setDate(deadline.getDate() + 3);
    onboarding.answers.targetCompletionDate = localDayKey(deadline);
    saveOnboardingRecord(onboarding);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const overdueDate = localDayKey(yesterday);
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ version: 1, updatedAt: "", tasks: [
      { id: "overdue-problem", problemId: "overdue-problem", date: overdueDate, title: "Overdue practice", chapter: "Arrays", section: "Fundamentals", minutes: 30, status: "planned", url: null, kind: "practice" },
    ] }));
    render(<Calendar/>);
    expect(await screen.findByText(/1 tasks · 30 estimated minutes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reduce this sprint target" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(SPRINTS_STORAGE_KEY)!).find((sprint: { targets: { problems: number } }) => sprint.targets.problems === 4)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Extend completion date by 2 weeks" }));
    await waitFor(() => expect(loadOnboardingRecord()?.answers.targetCompletionDate).not.toBe(onboarding.answers.targetCompletionDate));
    fireEvent.click(screen.getByRole("button", { name: "Redistribute gradually" }));
    await waitFor(() => expect(Boolean(loadPlannerRecord().tasks.find((task) => task.problemId === "overdue-problem") && loadPlannerRecord().tasks.find((task) => task.problemId === "overdue-problem")!.date >= localDayKey(new Date()))).toBe(true));
    expect(loadPlannerRecord().tasks.filter((task) => task.problemId === "overdue-problem")).toHaveLength(1);
  });

  it("dismisses the recovery prompt without changing overdue task records", async () => {
    render(<Calendar/>);
    const initial = loadPlannerRecord().tasks;
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss overdue prompt" }));
    expect(loadPlannerRecord().tasks).toEqual(initial);
    expect(screen.queryByText(/unfinished tasks from earlier days/)).toBeNull();
  });
});
