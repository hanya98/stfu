import { describe, expect, it } from "vitest";
import { createDefaultRecord } from "@/lib/onboarding/types";
import { DEFAULT_ROADMAP_CATALOG } from "@/lib/roadmap/catalog-storage";
import { EMPTY_ROADMAP_PROGRESS } from "@/lib/roadmap/progress";
import type { PlannerTask } from "@/lib/planner/engine";
import type { RoadmapProgressRecord } from "@/lib/roadmap/types";
import { buildAnalyticsSnapshot } from "./model";

const now = new Date(2026, 2, 12, 12);
const today = "2026-03-12";
const baseTask = (id: string, patch: Partial<PlannerTask> = {}): PlannerTask => ({ id, problemId: "p-1", date: today, title: "A problem", chapter: "Arrays", section: "Basics", minutes: 45, status: "planned", url: null, kind: "practice", ...patch });

describe("analytics derived from saved records", () => {
  const first = DEFAULT_ROADMAP_CATALOG.sections.flatMap((section) => section.topics)[0];
  const second = DEFAULT_ROADMAP_CATALOG.sections.flatMap((section) => section.topics)[1];
  const onboarding = { ...createDefaultRecord(), completed: true, answers: { ...createDefaultRecord().answers, studyDays: [1, 2, 3, 4, 5], minutesPerDay: 60, weeklyProblemTarget: 8 } };
  const progress: RoadmapProgressRecord = { ...EMPTY_ROADMAP_PROGRESS, problems: {
    [first.id]: { status: "solved", notes: "", minutesSpent: 35, estimatedMinutes: null, url: "", attempts: [{ id: "a1", occurredAt: "2026-03-12T09:00:00.000Z", minutes: 25 }], solvedAt: "2026-03-12T09:30:00.000Z", updatedAt: "2026-03-12T09:30:00.000Z" },
    [second.id]: { status: "attempted", notes: "", minutesSpent: 0, estimatedMinutes: null, url: "", attempts: [], updatedAt: "" },
  } };

  it("uses actual logged time, keeps planned estimates separate, and does not treat revisions as new solves", () => {
    const tasks = [
      baseTask("done-practice", { status: "completed", completedAt: "2026-03-12T10:00:00.000Z", minutes: 45 }),
      baseTask("done-practice-duplicate", { status: "completed", completedAt: "2026-03-12T10:00:00.000Z", minutes: 45 }),
      baseTask("done-revision", { id: "done-revision", problemId: "p-revision", status: "completed", kind: "revision", minutes: 20 }),
      baseTask("planned", { id: "planned", problemId: "p-next", minutes: 30 }),
    ];
    const result = buildAnalyticsSnapshot(DEFAULT_ROADMAP_CATALOG, progress, tasks, [], onboarding, "7d", now);
    expect(result.completion.solved).toBe(1);
    expect(result.actualMinutes).toBe(25);
    expect(result.plannedMinutes).toBe(95);
    expect(result.revisionsCompleted).toBe(1);
    expect(result.daily.at(-1)?.solved).toBe(1);
    expect(result.completedTasks).toBe(2);
  });

  it("filters time windows and excludes un-timestamped legacy time from ranged activity", () => {
    const result = buildAnalyticsSnapshot(DEFAULT_ROADMAP_CATALOG, progress, [], [], onboarding, "7d", now);
    const all = buildAnalyticsSnapshot(DEFAULT_ROADMAP_CATALOG, progress, [], [], onboarding, "all", now);
    expect(result.actualMinutes).toBe(25);
    expect(result.daily).toHaveLength(7);
    expect(all.actualMinutes).toBe(35);
    expect(all.daily).toHaveLength(1);
  });

  it("excludes rest days from missed-day consistency calculations and handles an empty profile", () => {
    const empty = buildAnalyticsSnapshot(DEFAULT_ROADMAP_CATALOG, EMPTY_ROADMAP_PROGRESS, [], [], onboarding, "30d", now);
    expect(empty.consistencyPercent).toBeNull();
    expect(empty.missedStudyDays).toBeNull();
    expect(empty.completion.solved).toBe(0);
    const worked = { ...progress, problems: { ...progress.problems, [first.id]: { ...progress.problems[first.id], solvedAt: "2026-03-12T09:30:00.000Z" } } };
    const active = buildAnalyticsSnapshot(DEFAULT_ROADMAP_CATALOG, worked, [], [], onboarding, "30d", now);
    expect(active.consistencyPercent).not.toBeNull();
    expect(active.missedStudyDays).toBe(21);
  });
});
