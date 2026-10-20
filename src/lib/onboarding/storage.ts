import type { OnboardingRecord } from "./types";
import { createDefaultRecord, PREPARATION_GOALS, ROADMAP_TYPES } from "./types";
import { validateImportedTopics } from "./validation";
import { preserveMalformedLocalData } from "@/lib/persistence/recovery";

export const ONBOARDING_STORAGE_KEY = "planly-onboarding-v1";

export function parseOnboardingRecord(value: string | null): OnboardingRecord | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Partial<OnboardingRecord>;
    if (record.version !== 1 || !Number.isInteger(record.currentStep) || (record.currentStep as number) < 0 || (record.currentStep as number) > 6 || typeof record.completed !== "boolean" || typeof record.updatedAt !== "string" || !record.answers || typeof record.answers !== "object") return null;
    const answers = record.answers as Partial<OnboardingRecord["answers"]>;
    if (!Array.isArray(answers.goals) || !answers.goals.every((item) => typeof item === "string") || !Array.isArray(answers.studiedTopics) || !answers.studiedTopics.every((item) => typeof item === "string") || !Array.isArray(answers.studyDays) || !answers.studyDays.every((item) => Number.isInteger(item) && item >= 0 && item <= 6) || !Array.isArray(answers.preferredTimes) || !answers.preferredTimes.every((item) => typeof item === "string") || !Array.isArray(answers.selectedTopics) || !answers.selectedTopics.every((item) => typeof item === "string") || !Array.isArray(answers.importedTopics) || (answers.importedTopics.length > 0 && !validateImportedTopics(answers.importedTopics).valid) || typeof answers.minutesPerDay !== "number" || !Number.isFinite(answers.minutesPerDay) || typeof answers.weeklyProblemTarget !== "number" || !Number.isFinite(answers.weeklyProblemTarget) || typeof answers.roadmap !== "string" || typeof answers.topicSelection !== "string" || typeof answers.language !== "string" || typeof answers.experience !== "string" || typeof answers.proficiency !== "string" || typeof answers.difficulty !== "string" || typeof answers.customGoal !== "string" || typeof answers.targetCompletionDate !== "string") return null;
    return record as OnboardingRecord;
  } catch { return null; }
}

export function loadOnboardingRecord(): OnboardingRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const rawCurrent = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    const current = parseOnboardingRecord(rawCurrent);
    if (current) return current;
    if (rawCurrent) preserveMalformedLocalData(ONBOARDING_STORAGE_KEY, rawCurrent);
    const legacyValue = window.localStorage.getItem("planly-onboarding");
    if (!legacyValue) return null;
    const legacy: unknown = JSON.parse(legacyValue);
    if (!legacy || typeof legacy !== "object") return null;
    const old = legacy as { goal?: unknown; level?: unknown; language?: unknown; minutes?: unknown; days?: unknown; roadmap?: unknown };
    const record = createDefaultRecord();
    const goalAliases: Record<string, string> = { "SDE internship": "Internship preparation", "Software engineering role": "Software engineering placements", "Product-based companies": "Product-based companies", "General interview preparation": "General interview preparation" };
    if (typeof old.goal === "string") record.answers.goals = [goalAliases[old.goal] ?? (PREPARATION_GOALS.includes(old.goal as (typeof PREPARATION_GOALS)[number]) ? old.goal : "")].filter(Boolean);
    if (typeof old.level === "string") record.answers.experience = ({ Beginner: "New to DSA", Intermediate: "Some practice", Advanced: "Interview ready" } as Record<string, string>)[old.level] ?? record.answers.experience;
    if (typeof old.language === "string") record.answers.language = old.language;
    const minutes = Number(old.minutes); if (Number.isInteger(minutes) && minutes >= 15 && minutes <= 480) record.answers.minutesPerDay = minutes;
    const days = Number(old.days); if (Number.isInteger(days) && days >= 1 && days <= 7) record.answers.studyDays = [1, 2, 3, 4, 5, 6, 0].slice(0, days);
    if (typeof old.roadmap === "string" && ROADMAP_TYPES.includes(old.roadmap as (typeof ROADMAP_TYPES)[number])) record.answers.roadmap = old.roadmap;
    record.updatedAt = new Date().toISOString();
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    window.localStorage.removeItem("planly-onboarding");
    return record;
  } catch { return null; }
}

export function saveOnboardingRecord(record: OnboardingRecord): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") return { ok: false, message: "Local browser storage is unavailable." };
  try { window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ ...record, updatedAt: new Date().toISOString() })); return { ok: true }; }
  catch { return { ok: false, message: "Planly could not save this plan in your browser. Check your browser storage settings and try again." }; }
}
