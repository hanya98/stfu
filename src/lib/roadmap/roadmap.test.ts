import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mapCsvRows, parseCsv, parseStriverOutline } from "./importer";
import { countProgress, loadRoadmapProgress, parseRoadmapProgress, ROADMAP_PROGRESS_KEY, saveRoadmapProgress } from "./progress";
import { mergeCsvRows, mergeOutlineImport, parseRoadmapCatalog, saveRoadmapCatalog, ROADMAP_CATALOG_KEY, DEFAULT_ROADMAP_CATALOG } from "./catalog-storage";
import type { RoadmapProgressRecord } from "./types";

const sourceText = readFileSync(resolve(process.cwd(), "src/data/source/striver-sheet.txt"), "utf8");

describe("imported sheet audit and parser", () => {
  it("parses the preserved plain-text sheet without fabricating absent fields", () => {
    const preview = parseStriverOutline(sourceText);
    expect(preview.sections).toHaveLength(104);
    expect(preview.sections.reduce((sum, section) => sum + section.topics.length, 0)).toBe(495);
    expect(preview.contests).toHaveLength(15);
    expect(preview.sections.flatMap((section) => section.topics).filter((problem) => problem.level === null)).toHaveLength(15);
    expect(preview.sections.flatMap((section) => section.topics).every((problem) => problem.url === null && problem.estimatedMinutes === null)).toBe(true);
    expect(preview.errors).toHaveLength(0);
    expect(preview.warnings.filter((warning) => warning.message.includes("Difficulty tag"))).toHaveLength(15);
    expect(preview.sections.filter((section) => section.topics.length > 0).reduce((sum, section) => sum + section.reportedCompleted, 0)).toBe(267);
    expect(preview.sections.filter((section) => section.topics.length > 0).reduce((sum, section) => sum + section.reportedTotal, 0)).toBe(495);
  });

  it("preserves duplicated names in separate sections and source ordering", () => {
    const preview = parseStriverOutline(sourceText);
    const duplicates = preview.sections.flatMap((section) => section.topics.map((problem) => ({ section: section.sourceKey, problem }))).filter(({ problem }) => problem.name.toLocaleLowerCase() === "factorial of a given number");
    expect(duplicates).toHaveLength(2);
    expect(new Set(duplicates.map(({ problem }) => problem.sourceKey)).size).toBe(2);
    expect(preview.sections[0].name).toBe("Beginner Problems");
    expect(preview.sections[1].name).toBe("Fundamentals of Programming");
    const repeated = parseStriverOutline("Chapter\nSection\n2/2\nSame problem\nSame problem");
    expect(repeated.sections[0].topics).toHaveLength(2);
    expect(repeated.warnings.some((warning) => warning.message.includes("Duplicate problem label"))).toBe(true);
  });

  it("parses quoted CSV cells and reports malformed widths, URLs, durations, and duplicate rows", () => {
    const table = parseCsv('Chapter,Section,Problem,URL,Duration,Level,Order\r\nArrays,Fundamentals,"Two Sum, variant",https://example.org/two-sum,30,Basic,1\r\nArrays,Fundamentals,Two Sum,ftp://bad.example,NaN,Easy,2\r\nArrays,Fundamentals,Two Sum,,,,3');
    const mapped = mapCsvRows(table, { chapter: 0, section: 1, problem: 2, sourceId: null, url: 3, durationMinutes: 4, difficulty: 5, order: 6 });
    expect(mapped.rows).toHaveLength(3);
    expect(mapped.rows[0].name).toBe("Two Sum, variant");
    expect(mapped.rows[0].estimatedMinutes).toBe(30);
    expect(mapped.rows[1].url).toBe("");
    expect(mapped.rows[1].estimatedMinutes).toBeNull();
    expect(mapped.errors.some((issue) => issue.message.includes("http or https"))).toBe(true);
    expect(mapped.errors.some((issue) => issue.message.includes("Duration"))).toBe(true);
    expect(mapped.warnings.some((issue) => issue.message.includes("Duplicate"))).toBe(true);
    expect(parseCsv('A,B\n"unfinished,2').errors.length).toBeGreaterThan(0);

    const partialTable = parseCsv("Section,Problem,URL\nArrays,One,https://example.org/one\nOnlyArrays");
    const partial = mapCsvRows(partialTable, { chapter: null, section: 0, problem: 1, sourceId: null, url: 2, durationMinutes: null, difficulty: null, order: null });
    expect(partial.rows).toHaveLength(1);
    expect(partial.failedRows).toBe(1);
    expect(mergeCsvRows(DEFAULT_ROADMAP_CATALOG, partial.rows, partial.failedRows).counts).toMatchObject({ imported: 1, failed: 1 });
  });
});

describe("catalogue and progress persistence", () => {
  beforeEach(() => { window.localStorage.clear(); });

  it("reimports the same text idempotently and preserves stable IDs", () => {
    const initial = DEFAULT_ROADMAP_CATALOG;
    const beforeId = initial.sections[1].topics[0].id;
    const result = mergeOutlineImport(initial, parseStriverOutline(sourceText));
    expect(result.counts.imported).toBe(0);
    expect(result.counts.updated).toBe(0);
    expect(result.counts.skipped).toBe(495);
    expect(result.catalog.sections[1].topics[0].id).toBe(beforeId);
    expect(result.catalog.sections.flatMap((section) => section.topics)).toHaveLength(495);
  });

  it("merges repeated CSV imports idempotently and preserves problem IDs and URLs", () => {
    const table = parseCsv("Chapter,Section,Problem,URL,Duration,Level,Order\nArrays,Fundamentals,Two Sum,https://example.org/two-sum,30,Basic,1");
    const rows = mapCsvRows(table, { chapter: 0, section: 1, problem: 2, sourceId: null, url: 3, durationMinutes: 4, difficulty: 5, order: 6 });
    const first = mergeCsvRows(DEFAULT_ROADMAP_CATALOG, rows.rows);
    const item = first.catalog.sections.find((section) => section.sourceKey === "csv-section:arrays|fundamentals")?.topics[0];
    expect(item?.url).toBe("https://example.org/two-sum");
    expect(item?.estimatedMinutes).toBe(30);
    const repeated = mergeCsvRows(first.catalog, rows.rows);
    expect(repeated.counts).toEqual({ imported: 0, updated: 0, skipped: 1, failed: 0 });
    expect(repeated.catalog.sections.find((section) => section.sourceKey === "csv-section:arrays|fundamentals")?.topics[0].id).toBe(item?.id);
  });

  it("uses a supplied stable source ID to keep problem identity across title edits", () => {
    const mapping = { chapter: 0, section: 1, problem: 2, sourceId: 3, difficulty: null, url: null, durationMinutes: null, order: 4 };
    const firstRows = mapCsvRows(parseCsv("Chapter,Section,Problem,ID,Order\nArrays,Fundamentals,Old title,strv-17,1"), mapping).rows;
    const first = mergeCsvRows(DEFAULT_ROADMAP_CATALOG, firstRows);
    const id = first.catalog.sections.find((section) => section.sourceKey === "csv-section:arrays|fundamentals")?.topics[0].id;
    const editedRows = mapCsvRows(parseCsv("Chapter,Section,Problem,ID,Order\nArrays,Fundamentals,Updated title,strv-17,1"), mapping).rows;
    const updated = mergeCsvRows(first.catalog, editedRows);
    const item = updated.catalog.sections.find((section) => section.sourceKey === "csv-section:arrays|fundamentals")?.topics[0];
    expect(item?.name).toBe("Updated title");
    expect(item?.id).toBe(id);
    expect(updated.counts.updated).toBe(1);
  });

  it("uses solved-only completion, counts attempts consistently, and handles an empty denominator", () => {
    const record: RoadmapProgressRecord = { version: 1, updatedAt: "", problems: { a: { status: "attempted", notes: "", minutesSpent: 0, estimatedMinutes: null, url: "", attempts: [], updatedAt: "" }, b: { status: "solved", notes: "", minutesSpent: 0, estimatedMinutes: null, url: "", attempts: [], updatedAt: "" } } };
    expect(countProgress([{ id: "a" }, { id: "b" }, { id: "c" }], record)).toEqual({ total: 3, solved: 1, attempted: 2, remaining: 2, percent: 33 });
    expect(countProgress([], record)).toEqual({ total: 0, solved: 0, attempted: 0, remaining: 0, percent: 0 });
  });

  it("safely parses progress, persists changes, and surfaces failed saves", () => {
    expect(parseRoadmapProgress("nope").problems).toEqual({});
    const record: RoadmapProgressRecord = { version: 1, updatedAt: new Date().toISOString(), problems: { problem: { status: "solved", notes: "revisit edge case", minutesSpent: 20, estimatedMinutes: 45, url: "https://example.org", attempts: [{ id: "attempt-1", occurredAt: new Date().toISOString(), minutes: 20 }], updatedAt: "" } } };
    expect(saveRoadmapProgress(record).ok).toBe(true);
    expect(loadRoadmapProgress().problems.problem.status).toBe("solved");
    const setter = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(saveRoadmapProgress(record).ok).toBe(false);
    setter.mockRestore();
  });

  it("saves and loads validated catalogues without touching onboarding storage", () => {
    const catalog = DEFAULT_ROADMAP_CATALOG;
    expect(saveRoadmapCatalog(catalog).ok).toBe(true);
    expect(parseRoadmapCatalog(window.localStorage.getItem(ROADMAP_CATALOG_KEY))?.sections).toHaveLength(104);
    expect(window.localStorage.getItem(ROADMAP_PROGRESS_KEY)).toBeNull();
  });
});
