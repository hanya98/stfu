import imported from "@/data/striver-roadmap.json";
import type { RoadmapCatalog } from "./types";
import { createCatalogFromOutline } from "./importer";
import type { OutlineImportPreview } from "./importer";
import { isValidExternalUrl } from "./progress";
import { preserveMalformedLocalData } from "@/lib/persistence/recovery";

export const ROADMAP_CATALOG_KEY = "planly-roadmap-catalog-v1";
export const DEFAULT_ROADMAP_CATALOG = imported as RoadmapCatalog;
export type ImportCounts = { imported: number; updated: number; skipped: number; failed: number };

function isCatalog(value: unknown): value is RoadmapCatalog {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RoadmapCatalog>;
  const validNumber = (number: unknown) => typeof number === "number" && Number.isInteger(number) && number >= 0;
  return data.version === 2 && typeof data.source === "string" && typeof data.sourceFile === "string" && typeof data.note === "string" && Array.isArray(data.sections) && data.sections.every((section) => section && typeof section.id === "string" && Boolean(section.id) && typeof section.sourceKey === "string" && typeof section.name === "string" && typeof section.chapter === "string" && validNumber(section.order) && validNumber(section.sourceLine) && validNumber(section.reportedCompleted) && validNumber(section.reportedTotal) && Array.isArray(section.topics) && section.topics.every((problem) => problem && typeof problem.id === "string" && Boolean(problem.id) && typeof problem.sourceKey === "string" && typeof problem.name === "string" && typeof problem.sourceLabel === "string" && ["basic", "core", "pro", null].includes(problem.level) && validNumber(problem.order) && validNumber(problem.sourceLine) && (problem.url === null || (typeof problem.url === "string" && isValidExternalUrl(problem.url))) && (problem.estimatedMinutes === null || (validNumber(problem.estimatedMinutes) && problem.estimatedMinutes >= 1 && problem.estimatedMinutes <= 1440)))) && Array.isArray(data.contests) && data.contests.every((contest) => contest && typeof contest.id === "string" && typeof contest.sourceKey === "string" && typeof contest.chapter === "string" && typeof contest.sectionId === "string" && typeof contest.sectionSourceKey === "string" && validNumber(contest.order) && typeof contest.sourceLabel === "string" && typeof contest.sourceLine === "number");
}

export function parseRoadmapCatalog(value: string | null): RoadmapCatalog | null {
  if (!value) return null;
  try { const parsed: unknown = JSON.parse(value); return isCatalog(parsed) ? parsed : null; } catch { return null; }
}

export function loadRoadmapCatalog(): RoadmapCatalog {
  if (typeof window === "undefined") return DEFAULT_ROADMAP_CATALOG;
  try {
    const raw = window.localStorage.getItem(ROADMAP_CATALOG_KEY);
    const catalog = parseRoadmapCatalog(raw);
    if (raw && !catalog) preserveMalformedLocalData(ROADMAP_CATALOG_KEY, raw);
    return catalog ?? DEFAULT_ROADMAP_CATALOG;
  }
  catch { return DEFAULT_ROADMAP_CATALOG; }
}

export function saveRoadmapCatalog(catalog: RoadmapCatalog): { ok: true } | { ok: false; message: string } {
  if (typeof window === "undefined") return { ok: false, message: "Browser storage is not available." };
  try { window.localStorage.setItem(ROADMAP_CATALOG_KEY, JSON.stringify(catalog)); return { ok: true }; }
  catch { return { ok: false, message: "The roadmap catalogue could not be saved in this browser. Check available storage and try again." }; }
}

function sameProblem(left: RoadmapCatalog["sections"][number]["topics"][number], right: typeof left) {
  return left.name === right.name && left.sourceLabel === right.sourceLabel && left.level === right.level && left.order === right.order && left.url === right.url && left.estimatedMinutes === right.estimatedMinutes;
}

export function mergeOutlineImport(current: RoadmapCatalog, preview: OutlineImportPreview, parseFailureCount = preview.errors.length): { catalog: RoadmapCatalog; counts: ImportCounts } {
  const incoming = createCatalogFromOutline(preview, current);
  const sections = current.sections.map((section) => ({ ...section, topics: [...section.topics] }));
  const sectionIndex = new Map(sections.map((section, index) => [section.sourceKey, index]));
  let importedCount = 0; let updated = 0; let skipped = 0;
  for (const nextSection of incoming.sections) {
    let index = sectionIndex.get(nextSection.sourceKey);
    if (index === undefined) { index = sections.length; sections.push({ ...nextSection, topics: [] }); sectionIndex.set(nextSection.sourceKey, index); }
    const section = sections[index];
    if (section.name !== nextSection.name || section.reportedCompleted !== nextSection.reportedCompleted || section.reportedTotal !== nextSection.reportedTotal) {
      sections[index] = { ...section, name: nextSection.name, chapter: nextSection.chapter, order: nextSection.order, sourceLine: nextSection.sourceLine, reportedCompleted: nextSection.reportedCompleted, reportedTotal: nextSection.reportedTotal };
    }
    const problemIndex = new Map(sections[index].topics.map((problem, problemIndex) => [problem.sourceKey, problemIndex]));
    for (const problem of nextSection.topics) {
      const existingIndex = problemIndex.get(problem.sourceKey);
      if (existingIndex === undefined) { problemIndex.set(problem.sourceKey, sections[index].topics.length); sections[index].topics.push(problem); importedCount += 1; }
      else {
        const old = sections[index].topics[existingIndex];
        if (sameProblem(old, problem)) skipped += 1;
        else { sections[index].topics[existingIndex] = { ...problem, id: old.id }; updated += 1; }
      }
    }
    sections[index].topics.sort((a, b) => a.order - b.order);
  }
  const contestMap = new Map(current.contests.map((contest) => [contest.sourceKey, contest]));
  const contests = [...current.contests];
  for (const contest of incoming.contests) {
    const old = contestMap.get(contest.sourceKey);
    if (!old) contests.push({ ...contest, sectionId: sections[sectionIndex.get(contest.sectionSourceKey) ?? 0]?.id ?? "" });
    else { const index = contests.findIndex((item) => item.sourceKey === contest.sourceKey); contests[index] = { ...contest, id: old.id, sectionId: sections[sectionIndex.get(contest.sectionSourceKey) ?? 0]?.id ?? "" }; }
  }
  return { catalog: { ...incoming, sections, contests }, counts: { imported: importedCount, updated, skipped, failed: parseFailureCount } };
}

export function mergeCsvRows(current: RoadmapCatalog, rows: ReturnType<typeof import("./importer").mapCsvRows>["rows"], failed = 0): { catalog: RoadmapCatalog; counts: ImportCounts } {
  const sections = current.sections.map((section) => ({ ...section, topics: [...section.topics] }));
  let importedCount = 0; let updated = 0; let skipped = 0;
  for (const row of rows) {
    const sectionKey = `csv-section:${row.chapter.toLocaleLowerCase()}|${row.section.toLocaleLowerCase()}`;
    let section = sections.find((item) => item.sourceKey === sectionKey);
    if (!section) { section = { id: makeStableId(), sourceKey: sectionKey, name: row.section, chapter: row.chapter, order: row.order, sourceLine: row.line, reportedCompleted: 0, reportedTotal: 0, topics: [] }; sections.push(section); }
    const problemKey = `problem:${row.sourceKey}`;
    const problem = section.topics.find((item) => item.sourceKey === problemKey);
    const sourceLabel = row.name;
    const next = { id: problem?.id ?? makeStableId(), sourceKey: problemKey, name: row.name, sourceLabel, level: row.level, order: row.order, sourceLine: row.line, url: row.url || null, estimatedMinutes: row.estimatedMinutes };
    if (!problem) { section.topics.push(next); importedCount += 1; }
    else if (problem.name === next.name && problem.sourceLabel === next.sourceLabel && problem.level === next.level && problem.order === next.order && problem.url === next.url && problem.estimatedMinutes === next.estimatedMinutes) skipped += 1;
    else { section.topics[section.topics.indexOf(problem)] = next; updated += 1; }
    section.topics.sort((a, b) => a.order - b.order);
  }
  const catalog: RoadmapCatalog = { ...current, sections, note: current.note, fieldAudit: { ...current.fieldAudit, format: "CSV", problemUrls: rows.some((row) => Boolean(row.url)), problemDurations: rows.some((row) => row.estimatedMinutes !== null) } };
  return { catalog, counts: { imported: importedCount, updated, skipped, failed } };
}

function makeStableId() { return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
