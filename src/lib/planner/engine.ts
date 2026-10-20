import type { OnboardingAnswers } from "@/lib/onboarding/types";
import type { RoadmapCatalog, RoadmapProblem, RoadmapProgressRecord } from "@/lib/roadmap/types";

export type PlannerTaskStatus = "planned" | "completed" | "attempted" | "skipped" | "rescheduled";
export type PlannerTask = { id: string; problemId: string; date: string; title: string; chapter: string; section: string; minutes: number; status: PlannerTaskStatus; url: string | null; kind: "practice" | "revision"; preferredTime?: string; completedAt?: string; userRescheduled?: boolean };
export type PlannerRecord = { version: 1; tasks: PlannerTask[]; updatedAt: string };
export type GeneratedSchedule = { tasks: PlannerTask[]; workloadMinutes: number; weeklyCapacityMinutes: number; estimatedWeeks: number; estimatedCompletionDate: string | null; availableMinutesUntilDeadline: number | null; feasibleByDeadline: boolean | null; assumptions: string[] };

const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const plusDay = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate()+days); return next; };
export const localDayKey = dayKey;
const weekKey = (date: Date) => { const monday = new Date(date); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); return dayKey(monday); };

function selectedSections(answers: OnboardingAnswers, catalog: RoadmapCatalog) {
  if (answers.roadmap === "Custom roadmap" && answers.importedTopics.length) return [];
  if (answers.topicSelection === "all") return catalog.sections;
  const selected = new Set(answers.selectedTopics.map((value) => value.toLocaleLowerCase()));
  const aliases: Record<string,string[]> = { "arrays and hashing": ["arrays","hashing"], "linked lists": ["linked-list","linked list"], "stacks and queues": ["stack","queue"], "greedy algorithms": ["greedy"], "trees": ["tree"], "binary search trees": ["binary search tree"], "graphs": ["graph"], "dynamic programming": ["dynamic programming"], "heaps": ["heap"], "sliding window": ["sliding window"], "recursion and backtracking": ["recursion","backtracking"], "programming basics": ["beginner problems"], "complexity analysis": ["time complexity"], "sorting": ["sorting"], "binary search": ["binary search"], "strings": ["string"], "bit manipulation": ["bit manipulation"], "tries": ["trie"] };
  const terms = new Set([...selected, ...[...selected].flatMap((name) => aliases[name] ?? [])]);
  return catalog.sections.filter((section) => terms.has(section.name.toLocaleLowerCase()) || terms.has(section.chapter.toLocaleLowerCase()));
}

function estimate(problem: RoadmapProblem, progress: RoadmapProgressRecord) {
  const custom = progress.problems[problem.id]?.estimatedMinutes;
  if (custom) return custom;
  if (problem.estimatedMinutes) return problem.estimatedMinutes;
  // Explicit planning estimates only; the imported sheet has no per-problem duration metadata.
  return problem.level === "basic" ? 30 : problem.level === "pro" ? 60 : 45;
}

function adjustedEstimate(problem: RoadmapProblem, progress: RoadmapProgressRecord, answers: OnboardingAnswers) {
  const difficultyFactor = answers.difficulty === "Mostly easy" ? 0.85 : answers.difficulty === "Balanced mix" ? 1.1 : answers.difficulty === "Medium and hard" ? 1.25 : 1;
  const proficiencyFactor = answers.proficiency === "Just starting" ? 1.2 : answers.proficiency === "Basic patterns" ? 1.1 : answers.proficiency === "Advanced problem solving" ? 0.9 : 1;
  const experienceFactor = answers.experience === "New to DSA" ? 1.1 : answers.experience === "Interview ready" ? 0.9 : 1;
  return Math.max(1, Math.round(estimate(problem, progress) * difficultyFactor * proficiencyFactor * experienceFactor));
}

export function generateRoadmapSchedule(answers: OnboardingAnswers, catalog: RoadmapCatalog, progress: RoadmapProgressRecord, now = new Date(), excludedProblemIds: ReadonlySet<string> = new Set()): GeneratedSchedule {
  const studied = new Set(answers.studiedTopics.map((value) => value.toLocaleLowerCase()));
  const sections = selectedSections(answers, catalog);
  const problems = sections.flatMap((section) => section.topics.map((problem) => ({ problem, section }))).filter(({ problem, section }) => {
    const state = progress.problems[problem.id];
    return state?.status !== "solved" && !excludedProblemIds.has(problem.id) && !studied.has(problem.name.toLocaleLowerCase()) && !studied.has(section.name.toLocaleLowerCase());
  });
  const workloadMinutes = problems.reduce((sum, { problem }) => sum + adjustedEstimate(problem, progress, answers), 0);
  const studyDays = new Set(answers.studyDays);
  const weeklyCapacityMinutes = studyDays.size * answers.minutesPerDay;
  let estimatedWeeks = weeklyCapacityMinutes ? Math.ceil(workloadMinutes / weeklyCapacityMinutes) : Infinity;
  const tasks: PlannerTask[] = [];
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let index = 0; let usedToday = 0; let tasksToday = 0; let guard = 0; let scheduledWeek = ""; let scheduledThisWeek = 0;
  while (index < problems.length && guard < 3650) {
    const currentWeek = weekKey(cursor); if (currentWeek !== scheduledWeek) { scheduledWeek = currentWeek; scheduledThisWeek = 0; }
    if (studyDays.has(cursor.getDay())) {
      usedToday = 0; tasksToday = 0;
      while (index < problems.length && scheduledThisWeek < answers.weeklyProblemTarget) {
        const { problem, section } = problems[index]; const minutes = adjustedEstimate(problem, progress, answers);
        if (usedToday > 0 && usedToday + minutes > answers.minutesPerDay) break;
        const date = dayKey(cursor);
        tasks.push({ id: `${problem.id}@${date}`, problemId: problem.id, date, title: problem.name, chapter: section.chapter, section: section.name, minutes, status: "planned", url: progress.problems[problem.id]?.url || problem.url, kind: progress.problems[problem.id]?.status === "attempted" ? "revision" : "practice", preferredTime: answers.preferredTimes[tasksToday % Math.max(answers.preferredTimes.length, 1)] });
        usedToday += minutes; tasksToday++; index++; scheduledThisWeek++;
      }
    }
    cursor = plusDay(cursor, 1); guard++;
  }
  const completionDate = tasks.at(-1)?.date ?? null;
  if (completionDate) estimatedWeeks = Math.max(1, Math.ceil((new Date(`${completionDate}T12:00:00`).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (7 * 86400000)));
  let availableMinutesUntilDeadline: number | null = null;
  if (answers.targetCompletionDate) {
    const deadline = new Date(`${answers.targetCompletionDate}T23:59:59`);
    const check = new Date(now.getFullYear(), now.getMonth(), now.getDate()); let days = 0;
    while (check <= deadline) { if (studyDays.has(check.getDay())) days++; check.setDate(check.getDate()+1); }
    availableMinutesUntilDeadline = days * answers.minutesPerDay;
  }
  return { tasks, workloadMinutes, weeklyCapacityMinutes, estimatedWeeks, estimatedCompletionDate: completionDate, availableMinutesUntilDeadline, feasibleByDeadline: availableMinutesUntilDeadline === null ? null : workloadMinutes <= availableMinutesUntilDeadline && Boolean(completionDate && completionDate <= answers.targetCompletionDate), assumptions: ["The schedule follows the imported roadmap order and excludes problems already marked solved.", "Each problem slot estimates concept review and problem-solving time together. Problem times use imported or personal estimates when available; otherwise Basic is estimated at 30 minutes, Core or untagged at 45, and Pro at 60. These are planning assumptions, not official Striver durations.", `Time estimates account for experience (${answers.experience}), DSA proficiency (${answers.proficiency}), and preferred difficulty (${answers.difficulty}).`, `The weekly problem target caps newly planned problems per calendar week at ${answers.weeklyProblemTarget}.`, "Attempted problems return as revision tasks. Tasks fill selected study days up to the available daily time; a single larger problem may exceed that time to avoid splitting a problem into misleading fragments."] };
}

export function mergeGeneratedSchedule(current: PlannerRecord, generated: GeneratedSchedule, fromDate: string): PlannerRecord {
  const history = current.tasks.filter((task) => task.date < fromDate || task.userRescheduled || ["completed", "attempted", "skipped"].includes(task.status));
  const preservedIds = new Set(history.map((task) => task.id));
  const pinnedProblems = new Set(history.filter((task) => task.userRescheduled && task.status === "planned").map((task) => task.problemId));
  const fresh = generated.tasks.filter((task) => !preservedIds.has(task.id) && !pinnedProblems.has(task.problemId));
  return { version: 1, tasks: [...history, ...fresh], updatedAt: new Date().toISOString() };
}

export function reconcileSolvedTasks(current: PlannerRecord, progress: RoadmapProgressRecord): PlannerRecord {
  let changed = false;
  const tasks = current.tasks.map((task) => {
    if (["planned", "attempted"].includes(task.status) && progress.problems[task.problemId]?.status === "solved") {
      changed = true;
      return { ...task, status: "completed" as const, completedAt: progress.problems[task.problemId].updatedAt || new Date().toISOString() };
    }
    return task;
  });
  return changed ? { ...current, tasks } : current;
}
