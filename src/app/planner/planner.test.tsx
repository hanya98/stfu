import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Planner from "./page";
import { createDefaultRecord } from "@/lib/onboarding/types";
import { saveOnboardingRecord } from "@/lib/onboarding/storage";
import { generateRoadmapSchedule, localDayKey, type PlannerTask } from "@/lib/planner/engine";
import { loadPlannerRecord, savePlannerRecord } from "@/lib/planner/storage";
import { DEFAULT_ROADMAP_CATALOG } from "@/lib/roadmap/catalog-storage";
import { loadRoadmapProgress } from "@/lib/roadmap/progress";

describe("daily planner flow", () => {
  beforeEach(() => { window.localStorage.clear(); vi.useRealTimers(); });
  afterEach(() => vi.restoreAllMocks());

  function seedPlan() {
    const record = createDefaultRecord(); record.answers.studyDays = [new Date().getDay()]; record.answers.minutesPerDay = 60; record.answers.topicSelection = "selected"; record.answers.selectedTopics = ["Beginner Problems"]; record.completed = true;
    saveOnboardingRecord(record);
    const plan = generateRoadmapSchedule(record.answers, DEFAULT_ROADMAP_CATALOG, loadRoadmapProgress());
    const saved = savePlannerRecord({ version: 1, tasks: plan.tasks, updatedAt: "" });
    return { record, tasks: saved.ok ? loadPlannerRecord().tasks : [] };
  }

  it("marks a real roadmap problem solved, persists it, and links to its A2Z row", async () => {
    const { tasks } = seedPlan(); const task = tasks.find((item) => item.date === localDayKey(new Date()))!;
    expect(task).toBeTruthy();
    const view = render(<Planner/>);
    const complete = await screen.findByRole("button", { name: `Mark ${task.title} complete` });
    const link = screen.getByRole("link", { name: /open roadmap entry/i });
    expect(link.getAttribute("href")).toContain(encodeURIComponent(task.problemId));
    fireEvent.click(complete);
    await waitFor(() => expect(loadRoadmapProgress().problems[task.problemId]?.status).toBe("solved"));
    expect(loadPlannerRecord().tasks.find((item) => item.id === task.id)?.status).toBe("completed");
    view.unmount(); render(<Planner/>);
    await screen.findByText("Done");
    const refreshed = generateRoadmapSchedule((await import("@/lib/onboarding/storage")).loadOnboardingRecord()!.answers, DEFAULT_ROADMAP_CATALOG, loadRoadmapProgress());
    expect(refreshed.tasks.some((item) => item.problemId === task.problemId)).toBe(false);
  });

  it("shows a recovery choice and redistributes missed tasks without losing their original history", async () => {
    const { record, tasks } = seedPlan();
    const past = new Date(); past.setDate(past.getDate() - 1); const pastKey = localDayKey(past);
    const section = DEFAULT_ROADMAP_CATALOG.sections.find((candidate) => candidate.topics.length > 0)!;
    const problem = section.topics[0];
    const missed: PlannerTask = { id: `${problem.id}@${pastKey}`, problemId: problem.id, date: pastKey, title: problem.name, chapter: section.chapter, section: section.name, minutes: 30, status: "planned", url: null, kind: "practice" };
    savePlannerRecord({ version: 1, tasks: [missed, ...tasks.filter((task) => task.problemId !== problem.id)], updatedAt: "" });
    render(<Planner/>);
    fireEvent.click(await screen.findByRole("button", { name: /redistribute all across future study days/i }));
    await waitFor(() => expect(loadPlannerRecord().tasks.find((task) => task.id === missed.id)?.status).toBe("rescheduled"));
    expect(screen.getByRole("status").textContent).toContain("redistributed");
    const replacements = loadPlannerRecord().tasks.filter((task) => task.problemId === missed.problemId && task.date >= localDayKey(new Date()) && task.status === "planned");
    expect(replacements.length).toBeGreaterThan(0);
    expect(record.answers.studyDays).toContain(new Date().getDay());
  });

  it("catches up one missed task at a time within available study minutes", async () => {
    const { tasks } = seedPlan(); const section = DEFAULT_ROADMAP_CATALOG.sections.find((candidate) => candidate.topics.length > 0)!; const problem = section.topics[0];
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1); const date = localDayKey(yesterday);
    const missed: PlannerTask = { id: `${problem.id}@${date}`, problemId: problem.id, date, title: problem.name, chapter: section.chapter, section: section.name, minutes: 30, status: "planned", url: null, kind: "practice" };
    savePlannerRecord({ version: 1, tasks: [missed, ...tasks.filter((task) => task.problemId !== problem.id)], updatedAt: "" });
    render(<Planner/>);
    const catchUp = await screen.findByRole("button", { name: /catch up on one task/i });
    expect(loadPlannerRecord().tasks.filter((task) => task.problemId === problem.id && task.date >= localDayKey(new Date()) && task.status === "planned")).toHaveLength(0);
    fireEvent.click(catchUp);
    await waitFor(() => expect(loadPlannerRecord().tasks.find((task) => task.id === missed.id)?.status).toBe("rescheduled"));
    const future = loadPlannerRecord().tasks.filter((task) => task.problemId === problem.id && task.date >= localDayKey(new Date()) && task.status === "planned");
    expect(future).toHaveLength(1);
    expect(future[0].date).not.toBe(date);
  });
});
