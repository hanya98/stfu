import type { RoadmapCatalog, RoadmapContest, RoadmapSection, RoadmapProblem, RoadmapDifficulty } from "./types";

const CHAPTERS = new Set(["Beginner Problems", "Arrays", "Hashing", "Binary Search", "Strings (Basic and Medium)", "Recursion", "Linked-List", "Bit Manipulation", "Greedy Algorithms", "Sliding Window / 2 Pointer", "Stack / Queues", "Binary Trees", "Binary Search Trees", "Heaps", "Graphs", "Dynamic Programming", "Tries", "Strings (Advanced Algo)", "Maths"]);
export type ImportIssue = { line: number; message: string; value: string };
export type OutlineImportPreview = { sections: Array<Omit<RoadmapSection, "id" | "topics"> & { topics: Array<Omit<RoadmapProblem, "id">> }>; contests: Array<Omit<RoadmapContest, "id" | "sectionId"> & { sectionId: string }>; errors: ImportIssue[]; warnings: ImportIssue[]; rowsRead: number };

function stableKey(value: string) { return value.trim().toLocaleLowerCase().replace(/\s+/g, " "); }
function makeId() { return globalThis.crypto?.randomUUID?.() ?? `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }

/** Parses the actual headings/counts/item format in the user-provided plain-text sheet. */
export function parseStriverOutline(text: string): OutlineImportPreview {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((value) => value.trim());
  const sections: OutlineImportPreview["sections"] = [];
  const contests: OutlineImportPreview["contests"] = [];
  const errors: ImportIssue[] = []; const warnings: ImportIssue[] = [];
  let current: OutlineImportPreview["sections"][number] | null = null;
  let chapter = "Beginner Problems"; let sequence = 0; let rowsRead = 0;
  const sectionNameCounts = new Map<string, number>();
  const addSection = (section: OutlineImportPreview["sections"][number] | null) => { if (section) sections.push(section); };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const count = lines[i + 1]?.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (count) {
      addSection(current);
      const name = line; if (CHAPTERS.has(name) && name !== "Beginner Problems") chapter = name;
      const occurrenceKey = `${stableKey(chapter)}|${stableKey(name)}`;
      const occurrence = sectionNameCounts.get(occurrenceKey) ?? 0; sectionNameCounts.set(occurrenceKey, occurrence + 1);
      sequence += 1; rowsRead += 1;
      current = { sourceKey: `section:${occurrenceKey}:${occurrence}`, name, chapter, order: sequence, sourceLine: i + 1, reportedCompleted: Number(count[1]), reportedTotal: Number(count[2]), topics: [] };
      i += 1; continue;
    }
    if (line.toLowerCase() === "contest") {
      const sourceLabel = lines[i + 1] ?? "";
      const match = sourceLabel.match(/(?:•|·)\s*(\d+)\s+Problems?\s*(?:•|·)\s*(\d+)\s+hours?/i);
      sequence += 1; rowsRead += 1;
      const sectionSourceKey = current?.sourceKey ?? ""; const occurrence = contests.filter((contest) => contest.sectionId === sectionSourceKey).length;
      contests.push({ sourceKey: `contest:${sectionSourceKey}:${occurrence}`, chapter, sectionId: sectionSourceKey, sectionSourceKey, order: sequence, problemCount: match ? Number(match[1]) : null, durationMinutes: match ? Number(match[2]) * 60 : null, sourceLabel, sourceLine: i + 1, parseError: match ? null : "Contest metadata did not match the expected problem-count and duration format." });
      if (!match) errors.push({ line: i + 2, message: "Could not parse contest metadata; the row was retained for review.", value: sourceLabel });
      if (lines[i + 2]?.toLowerCase() === "start contest") i += 2; else i += 1;
      continue;
    }
    if (line.toLowerCase() === "start contest" || line.startsWith("•")) continue;
    if (!current) { errors.push({ line: i + 1, message: "Entry appears before a section heading and count.", value: line }); continue; }
    const sourceLabel = line;
    const levelMatch = line.match(/(Basic|Core|Pro)$/i);
    const level = (levelMatch?.[1]?.toLowerCase() ?? null) as RoadmapDifficulty;
    const name = levelMatch ? line.slice(0, levelMatch.index).trim() : line;
    if (!name) { errors.push({ line: i + 1, message: "Problem name is empty after removing the difficulty suffix.", value: line }); continue; }
    if (!level) warnings.push({ line: i + 1, message: "Difficulty tag is not present in the source.", value: line });
    const duplicateNumber = current.topics.filter((topic) => stableKey(topic.name) === stableKey(name)).length;
    if (duplicateNumber) warnings.push({ line: i + 1, message: "Duplicate problem label in the same section; this row is retained as a separate problem.", value: name });
    const sourceKey = `problem:${current.sourceKey}::${stableKey(name)}::${duplicateNumber}`;
    sequence += 1; rowsRead += 1;
    current.topics.push({ sourceKey, name, sourceLabel, level, order: sequence, sourceLine: i + 1, url: null, estimatedMinutes: null });
  }
  addSection(current);
  for (const section of sections) {
    if (section.topics.length && section.topics.length !== section.reportedTotal) warnings.push({ line: section.sourceLine, message: `Section has ${section.topics.length} entries but its source count says ${section.reportedTotal}; source values were preserved.`, value: section.name });
  }
  const keys = new Set<string>();
  for (const section of sections) for (const topic of section.topics) { if (keys.has(topic.sourceKey)) warnings.push({ line: topic.sourceLine, message: "Repeated row identity detected; this row is retained and will be reviewed as a duplicate.", value: topic.name }); keys.add(topic.sourceKey); }
  return { sections, contests, errors, warnings, rowsRead };
}

export type CsvTable = { headers: string[]; rows: Array<{ line: number; values: string[] }>; errors: ImportIssue[] };
/** RFC-4180-style CSV tokenizer with quoted commas, escaped quotes and multiline fields. */
export function parseCsv(text: string): CsvTable {
  const input = text.replace(/^\uFEFF/, ""); const records: string[][] = []; const errors: ImportIssue[] = [];
  let row: string[] = []; let cell = ""; let quoted = false; let line = 1; let rowStart = 1;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else { cell += char; if (char === "\n") line += 1; }
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\r" || char === "\n") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell); if (row.some((value) => value.trim())) records.push(row); row = []; cell = ""; line += 1; rowStart = line;
    } else cell += char;
  }
  if (quoted) errors.push({ line: rowStart, message: "CSV ended inside a quoted field.", value: row.join(",") + cell });
  row.push(cell); if (row.some((value) => value.trim())) records.push(row);
  if (!records.length) return { headers: [], rows: [], errors: [...errors, { line: 1, message: "CSV is empty.", value: "" }] };
  const headers = records[0].map((header) => header.trim());
  const rows = records.slice(1).map((values, index) => ({ line: index + 2, values }));
  for (const item of rows) if (item.values.length !== headers.length) errors.push({ line: item.line, message: `Expected ${headers.length} columns but found ${item.values.length}; row retained for correction.`, value: item.values.join(",") });
  return { headers, rows, errors };
}

export type CsvColumnMapping = { chapter: number | null; section: number; problem: number; sourceId: number | null; difficulty: number | null; url: number | null; durationMinutes: number | null; order: number | null };
export type CsvMappedRow = { sourceKey: string; externalId: string | null; chapter: string; section: string; name: string; level: RoadmapDifficulty; url: string; estimatedMinutes: number | null; order: number; line: number };
export function mapCsvRows(table: CsvTable, mapping: CsvColumnMapping): { rows: CsvMappedRow[]; errors: ImportIssue[]; warnings: ImportIssue[]; failedRows: number } {
  const errors = [...table.errors]; const warnings: ImportIssue[] = []; const rows: CsvMappedRow[] = [];
  const failedLines = new Set(table.errors.map((error) => error.line));
  const seen = new Map<string, number>();
  for (const row of table.rows) {
    if (row.values.length !== table.headers.length) { failedLines.add(row.line); continue; }
    const read = (index: number | null) => index === null ? "" : (row.values[index] ?? "").trim();
    const section = read(mapping.section); const name = read(mapping.problem); const chapter = read(mapping.chapter) || "Imported roadmap";
    if (!section || !name) { errors.push({ line: row.line, message: "Section and problem columns are required; row retained for correction.", value: row.values.join(",") }); failedLines.add(row.line); continue; }
    const rawUrl = read(mapping.url); let url = "";
    if (rawUrl) { try { const parsed = new URL(rawUrl); if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.toString(); else throw new Error(); } catch { errors.push({ line: row.line, message: "URL must be a valid http or https address; row retained without a usable link.", value: rawUrl }); } }
    const rawDuration = read(mapping.durationMinutes); let estimatedMinutes: number | null = null;
    if (rawDuration) { const duration = Number(rawDuration); if (Number.isFinite(duration) && duration > 0 && duration <= 1440) estimatedMinutes = duration; else errors.push({ line: row.line, message: "Duration must be a number of minutes from 1 to 1440; row retained without an estimate.", value: rawDuration }); }
    const rawLevel = read(mapping.difficulty).toLowerCase(); const level: RoadmapDifficulty = rawLevel ? ({ basic: "basic", easy: "basic", core: "core", medium: "core", pro: "pro", hard: "pro" } as Record<string, RoadmapDifficulty>)[rawLevel] ?? null : null;
    if (rawLevel && !level) warnings.push({ line: row.line, message: "Difficulty label was not recognized and was retained as unavailable.", value: rawLevel });
    const externalId = read(mapping.sourceId) || null;
    const key = externalId ? `${stableKey(chapter)}|id:${stableKey(externalId)}` : `${stableKey(chapter)}|${stableKey(section)}|${stableKey(name)}`; const duplicate = seen.get(key) ?? 0; seen.set(key, duplicate + 1);
    if (duplicate) warnings.push({ line: row.line, message: externalId ? "Duplicate source ID; this row is retained separately and needs review." : "Duplicate problem name in the same section; this row is retained separately and needs review.", value: externalId ?? name });
    const explicitOrder = read(mapping.order); const sequence = explicitOrder ? Number(explicitOrder) : row.line;
    if (!Number.isInteger(sequence) || sequence < 1) errors.push({ line: row.line, message: "Order must be a positive whole number; source row order will be used.", value: explicitOrder });
    rows.push({ sourceKey: `csv:${key}:${duplicate}`, externalId, chapter, section, name, level, url, estimatedMinutes, order: Number.isInteger(sequence) && sequence > 0 ? sequence : row.line, line: row.line });
  }
  return { rows, errors, warnings, failedRows: failedLines.size };
}

export function createCatalogFromOutline(preview: OutlineImportPreview, existing?: RoadmapCatalog): RoadmapCatalog {
  const existingSections = new Map(existing?.sections.map((section) => [section.sourceKey, section]) ?? []);
  const sections = preview.sections.map((section) => {
    const oldSection = existingSections.get(section.sourceKey);
    const oldProblems = new Map(oldSection?.topics.map((topic) => [topic.sourceKey, topic]) ?? []);
    return { ...section, id: oldSection?.id ?? makeId(), topics: section.topics.map((problem) => ({ ...problem, id: oldProblems.get(problem.sourceKey)?.id ?? makeId() })) };
  });
  const contests = preview.contests.map((contest) => ({ ...contest, sectionId: existingSections.get(contest.sectionSourceKey)?.id ?? sections.find((section) => section.sourceKey === contest.sectionSourceKey)?.id ?? "", id: existing?.contests.find((item) => item.sourceKey === contest.sourceKey)?.id ?? makeId() }));
  return { version: 2, source: "User-provided Striver sheet import", sourceFile: "local import", fieldAudit: { format: "plain text outline", sectionCounters: true, problemTitles: true, difficultyTags: ["Basic", "Core", "Pro"], problemUrls: false, problemDurations: false, contestDurations: true }, note: "Original section labels, ordering, counts, problem names and difficulty suffixes are retained. Counters are source-sheet summaries, not user progress. No problem statements or links were supplied.", sections, contests };
}
