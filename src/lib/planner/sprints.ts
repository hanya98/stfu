import type { PlannerTask } from "./engine";

export const SPRINTS_STORAGE_KEY = "planly-weekly-sprints-v1";
export type SprintTargets = { problems: number; studyMinutes: number; revisions: number; topics: number };
export type WeeklySprint = { weekStart: string; targets: SprintTargets; updatedAt: string };
export type SprintProgress = SprintTargets;
export function weekStartKey(date: Date) {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday.getFullYear() + "-" + String(monday.getMonth() + 1).padStart(2, "0") + "-" + String(monday.getDate()).padStart(2, "0");
}
export function addLocalDays(date: Date, days: number) { const next = new Date(date.getFullYear(), date.getMonth(), date.getDate()); next.setDate(next.getDate() + days); return next; }
export function dateKey(date: Date) { return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0"); }
export function parseSprints(value: string | null): WeeklySprint[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WeeklySprint => {
      if (!item || typeof item !== "object") return false;
      const sprint = item as WeeklySprint;
      return /^\d{4}-\d{2}-\d{2}$/.test(sprint.weekStart) && !!sprint.targets &&
        ["problems", "studyMinutes", "revisions", "topics"].every((key) => Number.isInteger(sprint.targets[key as keyof SprintTargets]) && sprint.targets[key as keyof SprintTargets] >= 0);
    });
  } catch { return []; }
}
export function loadSprints(): WeeklySprint[] { try { return typeof window === "undefined" ? [] : parseSprints(window.localStorage.getItem(SPRINTS_STORAGE_KEY)); } catch { return []; } }
export function saveSprint(sprint: WeeklySprint): { ok: true } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sprint.weekStart) || Object.values(sprint.targets).some((value) => !Number.isInteger(value) || value < 0 || value > 100000)) return { ok: false, message: "Sprint targets must be non-negative whole numbers." };
  try {
    if (typeof window === "undefined") return { ok: false, message: "Browser storage is unavailable." };
    const sprints = loadSprints();
    const next = [...sprints.filter((item) => item.weekStart !== sprint.weekStart), { ...sprint, updatedAt: new Date().toISOString() }].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    window.localStorage.setItem(SPRINTS_STORAGE_KEY, JSON.stringify(next)); return { ok: true };
  } catch { return { ok: false, message: "Could not save sprint targets in this browser." }; }
}
export function suggestedSprintTargets(tasks: PlannerTask[], minutesPerDay: number, studyDays: number[], weeklyProblemTarget: number): SprintTargets {
  const revisions = tasks.filter((task) => task.kind === "revision" && ["planned", "attempted"].includes(task.status)).length;
  const practice = tasks.filter((task) => task.kind === "practice" && ["planned", "attempted"].includes(task.status));
  return { problems: weeklyProblemTarget, studyMinutes: minutesPerDay * studyDays.length, revisions, topics: new Set(practice.map((task) => task.section)).size };
}
export function calculateSprintProgress(tasks: PlannerTask[], weekStart: string): SprintProgress {
  const endKey = dateKey(addLocalDays(new Date(weekStart + "T12:00:00"), 7));
  const unique = new Map<string, PlannerTask>();
  tasks.filter((task) => task.date >= weekStart && task.date < endKey && task.status === "completed").forEach((task) => { const existing = unique.get(task.problemId); if (!existing || task.completedAt && (!existing.completedAt || task.completedAt > existing.completedAt)) unique.set(task.problemId, task); });
  const completed = [...unique.values()]; const practice = completed.filter((task) => task.kind === "practice");
  return { problems: practice.length, studyMinutes: completed.reduce((sum, task) => sum + task.minutes, 0), revisions: completed.filter((task) => task.kind === "revision").length, topics: new Set(practice.map((task) => task.section)).size };
}
export function sprintDailyBreakdown(tasks: PlannerTask[], weekStart: string) {
  return Array.from({ length: 7 }, (_, offset) => {
    const key = dateKey(addLocalDays(new Date(weekStart + "T12:00:00"), offset)); const unique = new Map<string, PlannerTask>();
    tasks.filter((task) => task.date === key).forEach((task) => { const existing = unique.get(task.problemId); if (!existing || task.status === "completed") unique.set(task.problemId, task); });
    const dayTasks = [...unique.values()];
    return { date: key, planned: dayTasks.filter((task) => ["planned", "attempted"].includes(task.status)).length, completed: dayTasks.filter((task) => task.status === "completed").length, minutes: dayTasks.filter((task) => task.status === "completed").reduce((sum, task) => sum + task.minutes, 0) };
  });
}
export function weekdayIndex(key: string) { return new Date(key + "T12:00:00").getDay(); }
export function freshSprint(weekStart: string, targets: SprintTargets): WeeklySprint { return { weekStart, targets, updatedAt: new Date().toISOString() }; }
