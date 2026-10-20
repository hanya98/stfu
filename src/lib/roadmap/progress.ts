import type { ProgressCounts, ProblemProgress, ProblemStatus, RoadmapCatalog, RoadmapProgressRecord, RoadmapSection } from "./types";
import { preserveMalformedLocalData } from "@/lib/persistence/recovery";

export const ROADMAP_PROGRESS_KEY = "planly-roadmap-progress-v1";
export const EMPTY_ROADMAP_PROGRESS: RoadmapProgressRecord = { version: 1, problems: {}, updatedAt: "" };
const STATUSES: ProblemStatus[] = ["not-started", "attempted", "solved"];
export function createRoadmapId() { return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

export function parseRoadmapProgress(value: string | null): RoadmapProgressRecord {
  if (!value) return EMPTY_ROADMAP_PROGRESS;
  try {
    const raw: unknown = JSON.parse(value);
    if (!raw || typeof raw !== "object") return EMPTY_ROADMAP_PROGRESS;
    const candidate = raw as Partial<RoadmapProgressRecord>;
    if (candidate.version !== 1 || !candidate.problems || typeof candidate.problems !== "object" || Array.isArray(candidate.problems)) return EMPTY_ROADMAP_PROGRESS;
    const problems: RoadmapProgressRecord["problems"] = {};
    for (const [id, value] of Object.entries(candidate.problems)) {
      if (!id || !value || typeof value !== "object") continue;
      const item = value as Partial<ProblemProgress>;
      if (!STATUSES.includes(item.status as ProblemStatus) || typeof item.notes !== "string" || typeof item.url !== "string" || (item.url !== "" && !isValidExternalUrl(item.url)) || typeof item.minutesSpent !== "number" || !Number.isInteger(item.minutesSpent) || item.minutesSpent < 0 || (item.estimatedMinutes !== null && (typeof item.estimatedMinutes !== "number" || !Number.isInteger(item.estimatedMinutes) || item.estimatedMinutes < 1 || item.estimatedMinutes > 1440)) || !Array.isArray(item.attempts)) continue;
      const seenAttempts = new Set<string>();
      const attempts = item.attempts.filter((attempt) => {
        if (!attempt || typeof attempt.id !== "string" || !attempt.id || seenAttempts.has(attempt.id) || typeof attempt.occurredAt !== "string" || !Number.isInteger(attempt.minutes) || attempt.minutes < 0 || attempt.minutes > 1440) return false;
        seenAttempts.add(attempt.id); return true;
      });
      const solvedAt = typeof item.solvedAt === "string" && Number.isFinite(Date.parse(item.solvedAt)) ? item.solvedAt : undefined;
      problems[id] = { status: item.status as ProblemStatus, notes: item.notes, url: item.url, minutesSpent: Math.max(0, item.minutesSpent), estimatedMinutes: item.estimatedMinutes, attempts, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "", ...(solvedAt ? { solvedAt } : {}) };
    }
    return { version: 1, problems, updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "" };
  } catch { return EMPTY_ROADMAP_PROGRESS; }
}

export function loadRoadmapProgress(): RoadmapProgressRecord {
  if (typeof window === "undefined") return EMPTY_ROADMAP_PROGRESS;
  try {
    const raw = window.localStorage.getItem(ROADMAP_PROGRESS_KEY);
    const parsed = parseRoadmapProgress(raw);
    if (raw) {
      try {
        const candidate = JSON.parse(raw) as Partial<RoadmapProgressRecord>;
        const rawCount = candidate.problems && typeof candidate.problems === "object" ? Object.keys(candidate.problems).length : -1;
        if (candidate.version !== 1 || rawCount < 0 || rawCount !== Object.keys(parsed.problems).length) preserveMalformedLocalData(ROADMAP_PROGRESS_KEY, raw);
      } catch { preserveMalformedLocalData(ROADMAP_PROGRESS_KEY, raw); }
    }
    return parsed;
  }
  catch { return EMPTY_ROADMAP_PROGRESS; }
}

export function saveRoadmapProgress(record: RoadmapProgressRecord): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") return { ok: false, message: "Browser storage is not available." };
  try { window.localStorage.setItem(ROADMAP_PROGRESS_KEY, JSON.stringify({ ...record, updatedAt: new Date().toISOString() })); return { ok: true }; }
  catch { return { ok: false, message: "Your progress could not be saved in this browser. Check available storage and try again." }; }
}

export function getProblemProgress(record: RoadmapProgressRecord, id: string): ProblemProgress {
  return record.problems[id] ?? { status: "not-started", notes: "", minutesSpent: 0, estimatedMinutes: null, url: "", attempts: [], updatedAt: "" };
}

export function countProgress(problems: Array<{ id: string }>, record: RoadmapProgressRecord): ProgressCounts {
  const total = problems.length;
  let solved = 0; let attempted = 0;
  for (const problem of problems) {
    const status = record.problems[problem.id]?.status ?? "not-started";
    if (status === "solved") solved += 1;
    if (status === "attempted" || status === "solved") attempted += 1;
  }
  return { total, solved, attempted, remaining: Math.max(0, total - solved), percent: total ? Math.round(solved / total * 100) : 0 };
}

export function flattenSections(sections: RoadmapSection[]) { return sections.flatMap((section) => section.topics); }
export function countSectionProgress(section: RoadmapSection, record: RoadmapProgressRecord) { return countProgress(section.topics, record); }
export function countChapterProgress(sections: RoadmapSection[], chapter: string, record: RoadmapProgressRecord) { return countProgress(sections.filter((section) => section.chapter === chapter).flatMap((section) => section.topics), record); }
export function countRoadmapProgress(catalog: RoadmapCatalog, record: RoadmapProgressRecord) { return countProgress(catalog.sections.flatMap((section) => section.topics), record); }
export function isValidExternalUrl(value: string): boolean { try { const parsed = new URL(value); return parsed.protocol === "https:" || parsed.protocol === "http:"; } catch { return false; } }
