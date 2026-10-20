import { beforeEach, describe, expect, it } from "vitest";
import { calculateSprintProgress, dateKey, loadSprints, parseSprints, saveSprint, sprintDailyBreakdown, suggestedSprintTargets, weekStartKey } from "./sprints";
import type { PlannerTask } from "./engine";
import { SPRINTS_STORAGE_KEY } from "./sprints";

const task = (patch: Partial<PlannerTask> = {}): PlannerTask => ({ id: "task-1", problemId: "p-1", date: "2026-10-19", title: "Two Sum", chapter: "Arrays", section: "Basics", minutes: 30, status: "completed", url: null, kind: "practice", ...patch });

describe("weekly sprint utilities", () => {
  beforeEach(() => localStorage.clear());
  it("uses Monday-based local weeks across month boundaries", () => {
    expect(weekStartKey(new Date(2026, 10, 1, 23))).toBe("2026-10-26");
    expect(dateKey(new Date(2026, 9, 31, 23))).toBe("2026-10-31");
  });
  it("counts completed unique practice and revisions separately", () => {
    const tasks = [
      task(),
      task({ id: "p-1-duplicate", date: "2026-10-20", minutes: 30 }),
      task({ id: "revision", problemId: "p-2", kind: "revision", status: "completed", minutes: 20, section: "Arrays" }),
      task({ id: "planned", problemId: "p-3", status: "planned" }),
    ];
    expect(calculateSprintProgress(tasks, "2026-10-19")).toEqual({ problems: 1, studyMinutes: 50, revisions: 1, topics: 1 });
    expect(sprintDailyBreakdown(tasks, "2026-10-19")[0]).toMatchObject({ completed: 2, minutes: 50 });
  });
  it("suggests targets from preferences and scheduled work, and persists a single sprint per week", () => {
    const suggestion = suggestedSprintTargets([task({ status: "planned", kind: "revision" }), task({ id: "another", problemId: "p-3", status: "planned", section: "Trees" })], 45, [1, 2, 3], 8);
    expect(suggestion).toEqual({ problems: 8, studyMinutes: 135, revisions: 1, topics: 1 });
    expect(saveSprint({ weekStart: "2026-10-19", targets: suggestion, updatedAt: "" }).ok).toBe(true);
    expect(saveSprint({ weekStart: "2026-10-19", targets: { ...suggestion, problems: 10 }, updatedAt: "" }).ok).toBe(true);
    expect(loadSprints()).toHaveLength(1);
    expect(loadSprints()[0].targets.problems).toBe(10);
    expect(parseSprints("broken")).toEqual([]);
  });
  it("rejects invalid targets", () => {
    expect(saveSprint({ weekStart: "2026-10-19", targets: { problems: -1, studyMinutes: 60, revisions: 0, topics: 0 }, updatedAt: "" }).ok).toBe(false);
    expect(localStorage.getItem(SPRINTS_STORAGE_KEY)).toBeNull();
  });
});
