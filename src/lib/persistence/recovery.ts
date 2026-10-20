export const STORAGE_RECOVERY_NOTICE_KEY = "planly-storage-recovery-notice-v1";

export function preserveMalformedLocalData(storageKey: string, raw: string) {
  if (typeof window === "undefined") return;
  try {
    const backupKey = `planly-recovery-backup:${storageKey}`;
    if (window.localStorage.getItem(backupKey) === null) window.localStorage.setItem(backupKey, JSON.stringify({ sourceKey: storageKey, savedAt: new Date().toISOString(), raw }));
    const current = window.localStorage.getItem(STORAGE_RECOVERY_NOTICE_KEY);
    const keys: unknown = current ? JSON.parse(current) : [];
    const next = Array.isArray(keys) ? keys.filter((key): key is string => typeof key === "string") : [];
    if (!next.includes(storageKey)) window.localStorage.setItem(STORAGE_RECOVERY_NOTICE_KEY, JSON.stringify([...next, storageKey]));
  } catch {
    // Keep loading the app if storage is read-only or full; the original value is never removed here.
  }
}

export function getStorageRecoveryNotice(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_RECOVERY_NOTICE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === "string") : [];
  } catch { return []; }
}

export function dismissStorageRecoveryNotice() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(STORAGE_RECOVERY_NOTICE_KEY); } catch { /* Notice dismissal is optional. */ }
}
