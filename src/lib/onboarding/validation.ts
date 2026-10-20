import { DIFFICULTIES, EXPERIENCE_LEVELS, LANGUAGES, PREPARATION_GOALS, ROADMAP_TYPES, STUDY_TIMES, STUDY_TOPICS, type ImportedTopic, type OnboardingAnswers } from "./types";

export type ValidationResult = { valid: boolean; message?: string };

export function validateStep(step: number, answers: OnboardingAnswers, today = new Date()): ValidationResult {
  if (step === 1) {
    if (!answers.goals.length) return { valid: false, message: "Choose at least one preparation goal." };
    if (answers.goals.some((goal) => !PREPARATION_GOALS.includes(goal as (typeof PREPARATION_GOALS)[number]))) return { valid: false, message: "Choose a goal from the available options." };
    if (answers.goals.includes("Custom goal") && !answers.customGoal.trim()) return { valid: false, message: "Describe your custom preparation goal." };
  }
  if (step === 2) {
    if (!EXPERIENCE_LEVELS.includes(answers.experience as (typeof EXPERIENCE_LEVELS)[number])) return { valid: false, message: "Choose your current experience level." };
    if (!LANGUAGES.includes(answers.language as (typeof LANGUAGES)[number])) return { valid: false, message: "Choose a programming language." };
    if (!answers.proficiency) return { valid: false, message: "Choose your current DSA proficiency." };
    if (!DIFFICULTIES.includes(answers.difficulty as (typeof DIFFICULTIES)[number])) return { valid: false, message: "Choose a preferred problem difficulty." };
  }
  if (step === 3) {
    if (!Number.isInteger(answers.minutesPerDay) || answers.minutesPerDay < 15 || answers.minutesPerDay > 480) return { valid: false, message: "Study time must be between 15 and 480 minutes per day." };
    if (!answers.studyDays.length || answers.studyDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return { valid: false, message: "Select at least one valid day of the week." };
    if (!answers.preferredTimes.length || answers.preferredTimes.some((time) => !STUDY_TIMES.includes(time as (typeof STUDY_TIMES)[number]))) return { valid: false, message: "Choose at least one preferred study time." };
    if (!Number.isInteger(answers.weeklyProblemTarget) || answers.weeklyProblemTarget < 1 || answers.weeklyProblemTarget > 200) return { valid: false, message: "Your weekly target must be between 1 and 200 problems." };
    if (answers.targetCompletionDate) {
      const date = parseDate(answers.targetCompletionDate);
      const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const maxDate = new Date(todayDate); maxDate.setFullYear(maxDate.getFullYear() + 5);
      if (!date || date < todayDate) return { valid: false, message: "Choose a target date today or later." };
      if (date > maxDate) return { valid: false, message: "Choose a target date within the next five years." };
    }
  }
  if (step === 4) {
    if (!ROADMAP_TYPES.includes(answers.roadmap as (typeof ROADMAP_TYPES)[number])) return { valid: false, message: "Choose a roadmap." };
    const selected = answers.topicSelection === "all" ? STUDY_TOPICS : answers.selectedTopics;
    if (!selected.length && !answers.importedTopics.length) return { valid: false, message: "Select at least one topic or import topic metadata." };
  }
  return { valid: true };
}

function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function validateImportedTopics(input: unknown): { valid: true; topics: ImportedTopic[] } | { valid: false; message: string } {
  if (!Array.isArray(input) || input.length === 0 || input.length > 100) return { valid: false, message: "Import a JSON array containing 1–100 topic objects." };
  const topics: ImportedTopic[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || raw.name.trim().length < 2 || raw.name.length > 120) return { valid: false, message: "Each topic needs a name between 2 and 120 characters." };
    const estimatedMinutes = raw.estimatedMinutes;
    if (estimatedMinutes !== undefined && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 15 || estimatedMinutes > 5000)) return { valid: false, message: `Invalid estimated duration for “${raw.name}”. Use 15–5000 minutes.` };
    const difficulty = raw.difficulty;
    if (difficulty !== undefined && !["easy", "medium", "hard"].includes(difficulty)) return { valid: false, message: `Invalid difficulty for “${raw.name}”.` };
    const links = raw.links;
    if (links !== undefined && (!Array.isArray(links) || links.length > 30)) return { valid: false, message: `Invalid official links for “${raw.name}”.` };
    const safeLinks: NonNullable<ImportedTopic["links"]> = [];
    for (const link of links ?? []) {
      if (!link || typeof link.title !== "string" || typeof link.url !== "string") return { valid: false, message: `Each link for “${raw.name}” needs a title and URL.` };
      try { const url = new URL(link.url); if (!["https:", "http:"].includes(url.protocol)) throw new Error(); safeLinks.push({ title: link.title.slice(0, 120), url: url.toString(), topic: typeof link.topic === "string" ? link.topic.slice(0, 120) : undefined }); }
      catch { return { valid: false, message: `Use a valid http or https link for “${raw.name}”.` }; }
    }
    topics.push({ name: raw.name.trim(), estimatedMinutes: estimatedMinutes ?? 120, difficulty: difficulty ?? "medium", links: safeLinks });
  }
  return { valid: true, topics };
}
