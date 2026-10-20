export const PREPARATION_GOALS = [
  "Internship preparation",
  "Software engineering placements",
  "Product-based companies",
  "General interview preparation",
  "Custom goal",
] as const;

export const EXPERIENCE_LEVELS = ["New to DSA", "Some practice", "Interview ready"] as const;
export const LANGUAGES = ["Python", "C++", "Java", "JavaScript", "TypeScript"] as const;
export const PROFICIENCY_LEVELS = ["Just starting", "Basic patterns", "Comfortable with common topics", "Advanced problem solving"] as const;
export const DIFFICULTIES = ["Mostly easy", "Easy and medium", "Balanced mix", "Medium and hard"] as const;
export const ROADMAP_TYPES = ["Striver A2Z DSA", "Custom roadmap", "Demo roadmap"] as const;
export const STUDY_TOPICS = [
  "Programming basics", "Complexity analysis", "Arrays and hashing", "Sorting", "Binary search", "Strings",
  "Linked lists", "Recursion and backtracking", "Bit manipulation", "Stacks and queues", "Sliding window",
  "Heaps", "Greedy algorithms", "Trees", "Binary search trees", "Graphs", "Dynamic programming", "Tries",
] as const;
export const STUDY_TIMES = ["Early morning", "Morning", "Afternoon", "Evening", "Late evening"] as const;

export type ImportedProblemLink = { title: string; url: string; topic?: string };
export type ImportedTopic = { name: string; estimatedMinutes?: number; difficulty?: "easy" | "medium" | "hard"; links?: ImportedProblemLink[] };

export type OnboardingAnswers = {
  goals: string[];
  customGoal: string;
  experience: string;
  language: string;
  proficiency: string;
  studiedTopics: string[];
  difficulty: string;
  minutesPerDay: number;
  studyDays: number[];
  preferredTimes: string[];
  targetCompletionDate: string;
  weeklyProblemTarget: number;
  roadmap: string;
  topicSelection: "all" | "selected";
  selectedTopics: string[];
  importedTopics: ImportedTopic[];
  importedMetadataText: string;
};

export type OnboardingRecord = {
  version: 1;
  answers: OnboardingAnswers;
  currentStep: number;
  completed: boolean;
  updatedAt: string;
};

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  goals: [], customGoal: "", experience: "Some practice", language: "Python", proficiency: "Basic patterns",
  studiedTopics: [], difficulty: "Easy and medium", minutesPerDay: 60, studyDays: [1, 2, 3, 4, 5],
  preferredTimes: ["Evening"], targetCompletionDate: "", weeklyProblemTarget: 12,
  roadmap: "Striver A2Z DSA", topicSelection: "all", selectedTopics: [...STUDY_TOPICS], importedTopics: [], importedMetadataText: "",
};

export function createDefaultRecord(): OnboardingRecord {
  return { version: 1, answers: { ...DEFAULT_ANSWERS, goals: [], studiedTopics: [], studyDays: [...DEFAULT_ANSWERS.studyDays], preferredTimes: [...DEFAULT_ANSWERS.preferredTimes], selectedTopics: [...STUDY_TOPICS], importedTopics: [] }, currentStep: 0, completed: false, updatedAt: new Date().toISOString() };
}
