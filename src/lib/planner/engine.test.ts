import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultRecord } from "@/lib/onboarding/types";
import { DEFAULT_ROADMAP_CATALOG } from "@/lib/roadmap/catalog-storage";
import { generateRoadmapSchedule, mergeGeneratedSchedule, reconcileSolvedTasks } from "./engine";
import { loadPlannerRecord, parsePlannerRecord, PLANNER_STORAGE_KEY, savePlannerRecord, updatePlannerTask } from "./storage";

describe("personalised roadmap schedule", () => {
  const { answers } = createDefaultRecord();
  const first = DEFAULT_ROADMAP_CATALOG.sections.find((section) => section.topics.length > 0)!.topics[0];
  const second = DEFAULT_ROADMAP_CATALOG.sections.find((section) => section.topics.length > 1)!.topics[1];
  const now = new Date(2026, 0, 5, 12); // Monday

  it("uses ordered catalogue problems, study availability, estimates and roadmap progress", () => {
    const customAnswers = { ...answers, topicSelection: "selected" as const, selectedTopics: [DEFAULT_ROADMAP_CATALOG.sections[0].chapter], studyDays: [1, 3], minutesPerDay: 45, weeklyProblemTarget: 2, targetCompletionDate: "2026-01-10" };
    const progress = { version: 1 as const, updatedAt: "", problems: { [first.id]: { status: "solved" as const, notes: "", url: "", minutesSpent: 0, estimatedMinutes: null, attempts: [], updatedAt: "" } } };
    const plan = generateRoadmapSchedule(customAnswers, DEFAULT_ROADMAP_CATALOG, progress, now);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks[0].problemId).not.toBe(first.id);
    expect(plan.tasks[0].date).toBe("2026-01-05");
    expect(plan.tasks[0].minutes).toBeGreaterThan(0);
    expect(plan.tasks[0].preferredTime).toBe("Evening");
    const firstWeekTasks = plan.tasks.filter((task) => task.date <= "2026-01-11");
    expect(firstWeekTasks.length).toBeLessThanOrEqual(2);
    expect(plan.feasibleByDeadline).toBe(false);
    expect(plan.assumptions.join(" ")).toContain("planning assumptions");
    const advanced = generateRoadmapSchedule({ ...customAnswers, experience: "Interview ready", proficiency: "Advanced problem solving" }, DEFAULT_ROADMAP_CATALOG, progress, now);
    expect(advanced.workloadMinutes).toBeLessThan(plan.workloadMinutes);
  });

  it("recalculates the completion horizon when daily study time changes", () => {
    const selected = { ...answers, topicSelection: "selected" as const, selectedTopics: [DEFAULT_ROADMAP_CATALOG.sections[0].chapter], studyDays: [1, 3, 5], weeklyProblemTarget: 200 };
    const shorter = generateRoadmapSchedule({ ...selected, minutesPerDay: 30 }, DEFAULT_ROADMAP_CATALOG, { version: 1, updatedAt: "", problems: {} }, now);
    const longer = generateRoadmapSchedule({ ...selected, minutesPerDay: 120 }, DEFAULT_ROADMAP_CATALOG, { version: 1, updatedAt: "", problems: {} }, now);
    expect(longer.estimatedCompletionDate).not.toBeNull();
    expect(shorter.estimatedCompletionDate).not.toBeNull();
    expect(longer.estimatedCompletionDate! < shorter.estimatedCompletionDate!).toBe(true);
  });

  it("does not clear completed history or reschedule solved work when regenerated", () => {
    const generated = generateRoadmapSchedule(answers, DEFAULT_ROADMAP_CATALOG, { version: 1, updatedAt: "", problems: {} }, now);
    const initial = mergeGeneratedSchedule({ version: 1, tasks: [], updatedAt: "" }, generated, "2026-01-05");
    const completed = updatePlannerTask(initial, initial.tasks[0].id, "completed");
    const progress = { version: 1 as const, updatedAt: "", problems: { [first.id]: { status: "solved" as const, notes: "", url: "", minutesSpent: 0, estimatedMinutes: null, attempts: [], updatedAt: "" } } };
    const rerun = generateRoadmapSchedule(answers, DEFAULT_ROADMAP_CATALOG, progress, now);
    const merged = mergeGeneratedSchedule(completed, rerun, "2026-01-05");
    expect(merged.tasks.find((task) => task.id === completed.tasks[0].id)?.status).toBe("completed");
    expect(merged.tasks.some((task) => task.problemId === first.id && task.status === "planned")).toBe(false);
  });

  it("replaces only future planned work and retains past task history", () => {
    const task = { id: `${second.id}@2026-01-04`, problemId: second.id, date: "2026-01-04", title: second.name, chapter: "Arrays", section: "Fundamentals", minutes: 45, status: "planned" as const, url: null, kind: "practice" as const };
    const current = { version: 1 as const, tasks: [task], updatedAt: "" };
    const generated = generateRoadmapSchedule(answers, DEFAULT_ROADMAP_CATALOG, { version: 1, updatedAt: "", problems: {} }, now);
    const merged = mergeGeneratedSchedule(current, generated, "2026-01-05");
    expect(merged.tasks).toContainEqual(task);
  });

  it("keeps a manually rescheduled future task without adding a duplicate generated task", () => {
    const generated = generateRoadmapSchedule(answers, DEFAULT_ROADMAP_CATALOG, { version: 1, updatedAt: "", problems: {} }, now);
    const moved = { ...generated.tasks[0], id: generated.tasks[0].problemId + "@2026-01-08", date: "2026-01-08", userRescheduled: true };
    const merged = mergeGeneratedSchedule({ version: 1, tasks: [moved], updatedAt: "" }, generated, "2026-01-05");
    expect(merged.tasks.filter((task) => task.problemId === moved.problemId)).toEqual([moved]);
  });

  it("reconciles a problem solved directly in the roadmap with its planned task", () => {
    const task = { id: `${first.id}@2026-01-05`, problemId: first.id, date: "2026-01-05", title: first.name, chapter: "Beginner Problems", section: "Fundamentals", minutes: 30, status: "planned" as const, url: null, kind: "practice" as const };
    const progress = { version: 1 as const, updatedAt: "", problems: { [first.id]: { status: "solved" as const, notes: "", url: "", minutesSpent: 30, estimatedMinutes: null, attempts: [], updatedAt: "2026-01-05T12:00:00.000Z" } } };
    expect(reconcileSolvedTasks({ version: 1, tasks: [task], updatedAt: "" }, progress).tasks[0].status).toBe("completed");
  });
});

describe("planner local persistence", () => {
  beforeEach(() => window.localStorage.clear());
  it("safely parses, saves and reloads tasks", () => {
    expect(parsePlannerRecord("not json").tasks).toEqual([]);
    const task = { id: "problem@2026-01-05", problemId: "problem", date: "2026-01-05", title: "Two Sum", chapter: "Arrays", section: "Fundamentals", minutes: 30, status: "planned" as const, url: null, kind: "practice" as const };
    expect(savePlannerRecord({ version: 1, tasks: [task], updatedAt: "" }).ok).toBe(true);
    expect(loadPlannerRecord().tasks).toEqual([task]);
    expect(window.localStorage.getItem(PLANNER_STORAGE_KEY)).not.toBeNull();
  });
});
