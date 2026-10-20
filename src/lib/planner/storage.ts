import type { PlannerRecord, PlannerTask, PlannerTaskStatus } from "./engine";
import { preserveMalformedLocalData } from "@/lib/persistence/recovery";

export const PLANNER_STORAGE_KEY = "planly-daily-plan-v1";
export const EMPTY_PLANNER: PlannerRecord = { version: 1, tasks: [], updatedAt: "" };
const statuses: PlannerTaskStatus[] = ["planned", "completed", "attempted", "skipped", "rescheduled"];

export function parsePlannerRecord(value: string | null): PlannerRecord {
  if (!value) return EMPTY_PLANNER;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return EMPTY_PLANNER;
    const record = parsed as Partial<PlannerRecord>;
    if (record.version !== 1 || !Array.isArray(record.tasks)) return EMPTY_PLANNER;
    const seen = new Set<string>();
    const tasks = record.tasks.filter((task): task is PlannerTask => {
      if (!task || typeof task !== "object") return false;
      const item = task as PlannerTask;
      if (typeof item.id !== "string" || !item.id || seen.has(item.id) || typeof item.problemId !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.date) || typeof item.title !== "string" || typeof item.chapter !== "string" || typeof item.section !== "string" || !Number.isInteger(item.minutes) || item.minutes < 1 || !statuses.includes(item.status) || (item.url !== null && typeof item.url !== "string") || !["practice", "revision"].includes(item.kind) || (item.userRescheduled !== undefined && typeof item.userRescheduled !== "boolean")) return false;
      seen.add(item.id); return true;
    });
    return { version: 1, tasks, updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "" };
  } catch { return EMPTY_PLANNER; }
}

export function loadPlannerRecord(): PlannerRecord {
  if (typeof window === "undefined") return EMPTY_PLANNER;
  try {
    const raw = window.localStorage.getItem(PLANNER_STORAGE_KEY);
    const parsed = parsePlannerRecord(raw);
    if (raw) {
      try {
        const candidate = JSON.parse(raw) as Partial<PlannerRecord>;
        if (candidate.version !== 1 || !Array.isArray(candidate.tasks) || candidate.tasks.length !== parsed.tasks.length) preserveMalformedLocalData(PLANNER_STORAGE_KEY, raw);
      } catch { preserveMalformedLocalData(PLANNER_STORAGE_KEY, raw); }
    }
    return parsed;
  } catch { return EMPTY_PLANNER; }
}

export function savePlannerRecord(record: PlannerRecord): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") return { ok: false, message: "Browser storage is not available." };
  try { window.localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ ...record, updatedAt: new Date().toISOString() })); return { ok: true }; }
  catch { return { ok: false, message: "The plan could not be saved in this browser. Check available storage and try again." }; }
}

export function updatePlannerTask(record: PlannerRecord, taskId: string, status: PlannerTaskStatus): PlannerRecord {
  return { ...record, tasks: record.tasks.map((task) => task.id === taskId ? { ...task, status, completedAt: status === "completed" ? new Date().toISOString() : task.completedAt } : task), updatedAt: new Date().toISOString() };
}
