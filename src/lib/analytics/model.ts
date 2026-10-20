import type { PlannerTask } from "@/lib/planner/engine";
import { calculateSprintProgress } from "@/lib/planner/sprints";
import type { WeeklySprint } from "@/lib/planner/sprints";
import type { OnboardingRecord } from "@/lib/onboarding/types";
import type { RoadmapCatalog, RoadmapProgressRecord } from "@/lib/roadmap/types";
import { countRoadmapProgress } from "@/lib/roadmap/progress";

export type AnalyticsRange = "7d" | "30d" | "all";
export type DailyMetric = { key: string; label: string; solved: number; actualMinutes: number; plannedMinutes: number };
export type AnalyticsSnapshot = {
  completion: ReturnType<typeof countRoadmapProgress>;
  sections: Array<{ id: string; chapter: string; name: string; solved: number; total: number; percent: number; attempted: number; revisionNeeded: number }>;
  topicProgress: Array<{ id: string; name: string; chapter: string; section: string; status: "not-started" | "attempted" | "solved"; attempts: number }>;
  daily: DailyMetric[];
  actualMinutes: number;
  plannedMinutes: number;
  revisionsCompleted: number;
  revisionsOverdue: number;
  completedTasks: number;
  attemptedTasks: number;
  plannedTasks: number;
  sprintRows: Array<{ weekStart: string; progress: ReturnType<typeof calculateSprintProgress>; targets: WeeklySprint["targets"] }>;
  consistencyPercent: number | null;
  currentStreak: number | null;
  missedStudyDays: number | null;
  activityDays: Set<string>;
  difficultSections: Array<{ chapter: string; name: string; attempts: number; problems: number }>;
  reviewProblems: Array<{ id: string; name: string; chapter: string; section: string; attempts: number; markedForRevision: boolean }>;
};
type Event = { id: string; day: string; minutes: number };
const keyForDate = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
const safeDay = (date: string) => {
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? "" : keyForDate(value);
};
function rangeStart(range: AnalyticsRange, now: Date) {
  if (range === "all") return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (range === "7d" ? 6 : 29));
  return keyForDate(start);
}
function inRange(day: string, start: string | null, end: string) { return Boolean(day && day <= end && (start === null || day >= start)); }

export function buildAnalyticsSnapshot(catalog: RoadmapCatalog, progress: RoadmapProgressRecord, tasks: PlannerTask[], sprints: WeeklySprint[], onboarding: OnboardingRecord | null, range: AnalyticsRange, now = new Date()): AnalyticsSnapshot {
  const end = keyForDate(now); const start = rangeStart(range, now);
  const problems = catalog.sections.flatMap((section) => section.topics.map((problem) => ({ problem, section })));
  const completion = countRoadmapProgress(catalog, progress);
  const topicProgress = problems.map(({ problem, section }) => ({ id: problem.id, name: problem.name, chapter: section.chapter, section: section.name, status: progress.problems[problem.id]?.status ?? "not-started" as const, attempts: progress.problems[problem.id]?.attempts.length ?? 0 }));
  const sections = catalog.sections.map((section) => {
    const solved = section.topics.filter((problem) => progress.problems[problem.id]?.status === "solved").length;
    const attempted = section.topics.filter((problem) => progress.problems[problem.id]?.status === "attempted").length;
    const total = section.topics.length;
    const revisionNeeded = section.topics.filter((problem) => progress.problems[problem.id]?.status === "attempted" || tasks.some((task) => task.problemId === problem.id && task.kind === "revision" && task.status !== "completed" && task.status !== "rescheduled")).length;
    return { id: section.id, chapter: section.chapter, name: section.name, solved, total, percent: total ? Math.round(solved / total * 100) : 0, attempted, revisionNeeded };
  });

  const events: Event[] = []; const seenAttempts = new Set<string>();
  for (const item of Object.values(progress.problems)) for (const attempt of item.attempts) {
    const day = safeDay(attempt.occurredAt);
    if (!day || !inRange(day, start, end) || seenAttempts.has(attempt.id) || attempt.minutes < 0) continue;
    seenAttempts.add(attempt.id); events.push({ id: attempt.id, day, minutes: attempt.minutes });
  }
  const timedActualMinutes = events.reduce((sum, event) => sum + event.minutes, 0);
  const untimedActualMinutes = range === "all" ? Object.values(progress.problems).reduce((sum, item) => sum + Math.max(0, item.minutesSpent - item.attempts.reduce((total, attempt) => total + attempt.minutes, 0)), 0) : 0;
  const actualMinutes = timedActualMinutes + untimedActualMinutes;
  const actualEventsInRange = events;
  const solvedEvents = problems.flatMap(({ problem }) => {
    const item = progress.problems[problem.id];
    const day = safeDay(item?.solvedAt ?? "");
    return day && inRange(day, start, end) ? [{ id: problem.id, day }] : [];
  });
  const completed = uniqueTasks(tasks.filter((task) => task.status === "completed"));
  const scheduled = uniqueTasks(tasks.filter((task) => !["skipped", "rescheduled"].includes(task.status)));
  const completedInRange = completed.filter((task) => { const day = task.completedAt ? safeDay(task.completedAt) : task.date; return inRange(day, start, end); });
  const plannedInRange = scheduled.filter((task) => inRange(task.date, start, end));
  const plannedTaskCount = uniqueTasks(tasks.filter((task) => task.status === "planned" && inRange(task.date, start, end))).length;
  const attemptedTaskCount = uniqueTasks(tasks.filter((task) => task.status === "attempted" && inRange(task.date, start, end))).length;
  const plannedMinutes = plannedInRange.reduce((sum, task) => sum + task.minutes, 0);
  const revisionsCompleted = completedInRange.filter((task) => task.kind === "revision").length;
  const overdueKeys = new Set<string>();
  for (const task of tasks) if (task.kind === "revision" && ["planned", "attempted"].includes(task.status) && task.date < end && inRange(task.date, start, end) && (!onboarding?.completed || onboarding.answers.studyDays.includes(new Date(task.date + "T12:00:00").getDay()))) overdueKeys.add(task.problemId + "|" + task.date);
  const activityDays = new Set<string>();
  for (const event of actualEventsInRange) activityDays.add(event.day);
  for (const item of solvedEvents) activityDays.add(item.day);
  for (const task of completedInRange) activityDays.add(task.completedAt ? safeDay(task.completedAt) : task.date);

  const activityKeys = [...events.map((event) => event.day), ...solvedEvents.map((event) => event.day), ...plannedInRange.map((task) => task.date)];
  const daily = makeDaily(range, end, now, activityKeys.length ? activityKeys.sort()[0] : null);
  const solvedByDay = new Map<string, number>();
  const bucket = (day: string) => range === "all" ? day.slice(0, 7) : day;
  for (const event of solvedEvents) { const key = bucket(event.day); solvedByDay.set(key, (solvedByDay.get(key) ?? 0) + 1); }
  const actualByDay = new Map<string, number>(); for (const event of events) { const key = bucket(event.day); actualByDay.set(key, (actualByDay.get(key) ?? 0) + event.minutes); }
  const plannedByDay = new Map<string, number>(); for (const task of plannedInRange) { const key = bucket(task.date); plannedByDay.set(key, (plannedByDay.get(key) ?? 0) + task.minutes); }
  for (const day of daily) { day.solved = solvedByDay.get(day.key) ?? 0; day.actualMinutes = actualByDay.get(day.key) ?? 0; day.plannedMinutes = plannedByDay.get(day.key) ?? 0; }

  const sprintRows = sprints.filter((sprint) => sprint.weekStart <= end && (start === null || sprint.weekStart >= start)).map((sprint) => ({ weekStart: sprint.weekStart, progress: calculateSprintProgress(tasks, sprint.weekStart), targets: sprint.targets }));
  const difficultyBySection = new Map<string, { chapter: string; name: string; attempts: number; problems: number }>();
  const reviewProblems: AnalyticsSnapshot["reviewProblems"] = [];
  for (const { problem, section } of problems) {
    const record = progress.problems[problem.id]; const attempts = record?.attempts.length ?? 0;
    const markedForRevision = record?.status === "attempted" || tasks.some((task) => task.problemId === problem.id && task.kind === "revision" && ["planned", "attempted"].includes(task.status));
    if (attempts || record?.status === "attempted" || markedForRevision) reviewProblems.push({ id: problem.id, name: problem.name, chapter: section.chapter, section: section.name, attempts, markedForRevision });
    if (!attempts && record?.status !== "attempted" && !markedForRevision) continue;
    const current = difficultyBySection.get(section.id) ?? { chapter: section.chapter, name: section.name, attempts: 0, problems: 0 };
    current.attempts += attempts; current.problems += 1; difficultyBySection.set(section.id, current);
  }

  const consistency = computeConsistency(tasks, progress, onboarding, now, range, activityDays);
  return { completion, sections, topicProgress, daily, actualMinutes, plannedMinutes, revisionsCompleted, revisionsOverdue: overdueKeys.size, completedTasks: completedInRange.length, attemptedTasks: attemptedTaskCount, plannedTasks: plannedTaskCount, sprintRows, ...consistency, activityDays, difficultSections: [...difficultyBySection.values()].sort((a, b) => b.attempts - a.attempts || b.problems - a.problems).slice(0, 8), reviewProblems: reviewProblems.sort((a, b) => Number(b.markedForRevision) - Number(a.markedForRevision) || b.attempts - a.attempts).slice(0, 12) };
}
function uniqueTasks(tasks: PlannerTask[]) {
  const unique = new Map<string, PlannerTask>();
  for (const task of tasks) {
    const key = task.problemId + "|" + task.date + "|" + task.kind;
    const previous = unique.get(key);
    if (!previous || task.completedAt && (!previous.completedAt || task.completedAt > previous.completedAt)) unique.set(key, task);
  }
  return [...unique.values()];
}
function makeDaily(range: AnalyticsRange, end: string, now: Date, firstActivity: string | null): DailyMetric[] {
  if (range === "all") {
    const current = new Date(now.getFullYear(), now.getMonth(), 1);
    const first = firstActivity ? new Date(firstActivity + "T12:00:00") : current;
    const monthCount = Math.min(120, Math.max(1, (current.getFullYear() - first.getFullYear()) * 12 + current.getMonth() - first.getMonth() + 1));
    const earliest = new Date(current.getFullYear(), current.getMonth() - monthCount + 1, 1);
    return Array.from({ length: monthCount }, (_, i) => { const date = new Date(earliest.getFullYear(), earliest.getMonth() + i, 1); return { key: date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0"), label: new Intl.DateTimeFormat(undefined, { month: "short", year: monthCount > 12 ? "2-digit" : undefined }).format(date), solved: 0, actualMinutes: 0, plannedMinutes: 0 }; });
  }
  const count = range === "7d" ? 7 : 30; const endDate = new Date(end + "T12:00:00");
  return Array.from({ length: count }, (_, i) => { const date = new Date(endDate); date.setDate(date.getDate() - (count - 1 - i)); const key = keyForDate(date); return { key, label: new Intl.DateTimeFormat(undefined, { weekday: count === 7 ? "short" : undefined, day: "numeric", month: count === 30 ? undefined : undefined }).format(date), solved: 0, actualMinutes: 0, plannedMinutes: 0 }; });
}
function computeConsistency(tasks: PlannerTask[], progress: RoadmapProgressRecord, onboarding: OnboardingRecord | null, now: Date, range: AnalyticsRange, activeInRange: Set<string>) {
  if (!onboarding?.completed || !onboarding.answers.studyDays.length) return { consistencyPercent: null, currentStreak: null, missedStudyDays: null };
  if (!activeInRange.size) return { consistencyPercent: null, currentStreak: null, missedStudyDays: null };
  const studyDays = new Set(onboarding.answers.studyDays);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const active = new Set<string>();
  for (const task of tasks) if (task.status === "completed") active.add(task.completedAt ? safeDay(task.completedAt) : task.date);
  for (const item of Object.values(progress.problems)) {
    if (item.solvedAt) active.add(safeDay(item.solvedAt));
    for (const attempt of item.attempts) active.add(safeDay(attempt.occurredAt));
  }
  const firstActivity = [...active].filter(Boolean).sort()[0] ?? keyForDate(end);
  const start = range === "all" ? new Date(firstActivity + "T12:00:00") : new Date(end);
  if (range !== "all") start.setDate(start.getDate() - (range === "7d" ? 6 : 29));
  let scheduled = 0; let kept = 0; let missed = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = keyForDate(cursor);
    const isToday = day === keyForDate(end);
    if (studyDays.has(cursor.getDay()) && (!isToday || active.has(day))) {
      scheduled++;
      if (active.has(day)) kept++; else if (!isToday) missed++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  let streak = 0; const cursorBack = new Date(end);
  if (studyDays.has(cursorBack.getDay()) && !active.has(keyForDate(cursorBack))) cursorBack.setDate(cursorBack.getDate() - 1);
  for (let guard = 0; guard < 3650; guard++) {
    if (studyDays.has(cursorBack.getDay())) {
      if (!active.has(keyForDate(cursorBack))) break;
      streak++;
    }
    cursorBack.setDate(cursorBack.getDate() - 1);
  }
  return { consistencyPercent: scheduled ? Math.round(kept / scheduled * 100) : activeInRange.size ? 0 : null, currentStreak: streak, missedStudyDays: activeInRange.size ? missed : null };
}
