import type { ImportedTopic, OnboardingAnswers } from "./types";
import { STUDY_TOPICS } from "./types";

export type ScheduledSession = { dayIndex: number; dayLabel: string; topics: string[]; minutes: number; problemTarget: number };
export type StudyPlan = { topics: ImportedTopic[]; estimatedWorkloadMinutes: number; availableMinutesUntilDeadline: number | null; estimatedWeeks: number; feasibleByDeadline: boolean | null; weeklyCapacityMinutes: number; weeklySprint: ScheduledSession[]; assumptions: string[] };

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_DURATIONS: Record<string, number> = {
  "Programming basics": 150, "Complexity analysis": 90, "Arrays and hashing": 240, Sorting: 150, "Binary search": 180,
  Strings: 150, "Linked lists": 180, "Recursion and backtracking": 270, "Bit manipulation": 150,
  "Stacks and queues": 180, "Sliding window": 180, Heaps: 180, "Greedy algorithms": 210, Trees: 300,
  "Binary search trees": 180, Graphs: 360, "Dynamic programming": 420, Tries: 150,
};

function difficultyFactor(difficulty: string): number { return difficulty === "Mostly easy" ? 0.82 : difficulty === "Medium and hard" ? 1.3 : difficulty === "Balanced mix" ? 1.15 : 1; }
function topicDifficultyFactor(difficulty: ImportedTopic["difficulty"]): number { return difficulty === "easy" ? 0.9 : difficulty === "hard" ? 1.25 : 1; }

export function generateStudyPlan(answers: OnboardingAnswers, now = new Date()): StudyPlan {
  const selected = answers.topicSelection === "all" ? [...STUDY_TOPICS] : answers.selectedTopics;
  const studied = new Set(answers.studiedTopics);
  const remaining = selected.filter((name) => !studied.has(name));
  const importedNames = new Set(answers.importedTopics.map((topic) => topic.name));
  const catalog = remaining.filter((name) => !importedNames.has(name)).map((name) => ({ name, estimatedMinutes: DEFAULT_DURATIONS[name] ?? 150, difficulty: "medium" as const }));
  const topics = [...catalog, ...answers.importedTopics.filter((topic) => !studied.has(topic.name))];
  const factor = difficultyFactor(answers.difficulty);
  const estimatedWorkloadMinutes = Math.round(topics.reduce((sum, topic) => sum + (topic.estimatedMinutes ?? DEFAULT_DURATIONS[topic.name] ?? 150) * topicDifficultyFactor(topic.difficulty), 0) * factor);
  const weeklyCapacityMinutes = answers.studyDays.length * answers.minutesPerDay;
  const estimatedWeeks = weeklyCapacityMinutes ? Math.ceil(estimatedWorkloadMinutes / weeklyCapacityMinutes) : Number.POSITIVE_INFINITY;
  let availableMinutesUntilDeadline: number | null = null;
  if (answers.targetCompletionDate) {
    const [year, month, day] = answers.targetCompletionDate.split("-").map(Number);
    const deadline = new Date(year, month - 1, day);
    const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let availableDays = 0;
    while (cursor <= deadline) { if (answers.studyDays.includes(cursor.getDay())) availableDays += 1; cursor.setDate(cursor.getDate() + 1); }
    availableMinutesUntilDeadline = availableDays * answers.minutesPerDay;
  }
  const sessions: ScheduledSession[] = answers.studyDays.slice().sort((a,b)=>a-b).map((dayIndex) => ({ dayIndex, dayLabel: DAY_LABELS[dayIndex], topics: [], minutes: answers.minutesPerDay, problemTarget: 0 }));
  const weeklyTopics = topics.slice(0, Math.min(topics.length, Math.ceil(weeklyCapacityMinutes / 150)));
  weeklyTopics.forEach((topic, index) => { if (sessions.length) sessions[index % sessions.length].topics.push(topic.name); });
  sessions.forEach((session) => { session.problemTarget = Math.floor(answers.weeklyProblemTarget / Math.max(sessions.length, 1)); });
  if (sessions.length) sessions[sessions.length - 1].problemTarget += answers.weeklyProblemTarget % sessions.length;
  return {
    topics, estimatedWorkloadMinutes, availableMinutesUntilDeadline, estimatedWeeks,
    feasibleByDeadline: availableMinutesUntilDeadline === null ? null : estimatedWorkloadMinutes <= availableMinutesUntilDeadline,
    weeklyCapacityMinutes, weeklySprint: sessions,
    assumptions: [
      "Topic durations are planning estimates, not guarantees; actual time varies by prior experience.",
      `Difficulty preference applies a ${factor.toFixed(2)}× time adjustment to the estimated topic workload.`,
      "The first sprint assigns topics in roadmap order across your selected study days.",
    ],
  };
}
