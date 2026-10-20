import { describe, expect, it } from "vitest";
import { loadPlannerRecord, PLANNER_STORAGE_KEY } from "@/lib/planner/storage";
import { dismissStorageRecoveryNotice, getStorageRecoveryNotice } from "./recovery";

describe("local storage recovery backups", () => {
  it("preserves malformed planner data and exposes a dismissible warning", () => {
    const malformed = '{"version":1,"tasks":[{"id":"unfinished"}]}';
    localStorage.setItem(PLANNER_STORAGE_KEY, malformed);
    expect(loadPlannerRecord().tasks).toEqual([]);
    const backup = JSON.parse(localStorage.getItem(`planly-recovery-backup:${PLANNER_STORAGE_KEY}`)!);
    expect(backup.raw).toBe(malformed);
    expect(getStorageRecoveryNotice()).toContain(PLANNER_STORAGE_KEY);
    dismissStorageRecoveryNotice();
    expect(getStorageRecoveryNotice()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(`planly-recovery-backup:${PLANNER_STORAGE_KEY}`)!).raw).toBe(malformed);
  });
});
