"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, Check, ChevronDown, ExternalLink, FileUp, ListChecks, LoaderCircle, Search, Upload } from "lucide-react";
import { DEFAULT_ROADMAP_CATALOG, loadRoadmapCatalog, mergeCsvRows, mergeOutlineImport, saveRoadmapCatalog } from "@/lib/roadmap/catalog-storage";
import { countChapterProgress, countRoadmapProgress, countSectionProgress, createRoadmapId, getProblemProgress, isValidExternalUrl, loadRoadmapProgress, saveRoadmapProgress } from "@/lib/roadmap/progress";
import { mapCsvRows, parseCsv, parseStriverOutline } from "@/lib/roadmap/importer";
import type { CsvColumnMapping, CsvTable, ImportIssue, OutlineImportPreview } from "@/lib/roadmap/importer";
import type { ProblemProgress, ProblemStatus, RoadmapCatalog, RoadmapProblem, RoadmapProgressRecord, RoadmapSection } from "@/lib/roadmap/types";

const initialMapping: CsvColumnMapping = { chapter: null, section: -1, problem: -1, sourceId: null, difficulty: null, url: null, durationMinutes: null, order: null };
type ImportMode = { type: "outline"; preview: OutlineImportPreview } | { type: "csv"; table: CsvTable };
function sourceOrder<T extends { order: number }>(items: T[]) { return [...items].sort((a, b) => a.order - b.order); }

export function RoadmapBrowser() {
  const [catalog, setCatalog] = useState<RoadmapCatalog>(DEFAULT_ROADMAP_CATALOG);
  const [progress, setProgress] = useState<RoadmapProgressRecord>({ version: 1, problems: {}, updatedAt: "" });
  const [loading, setLoading] = useState(true);
  const [targetProblemId, setTargetProblemId] = useState("");
  const [query, setQuery] = useState(""); const [statusFilter, setStatusFilter] = useState("all"); const [difficultyFilter, setDifficultyFilter] = useState("all"); const [sortOrder, setSortOrder] = useState("source");
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [importMode, setImportMode] = useState<ImportMode | null>(null); const [importName, setImportName] = useState(""); const [mapping, setMapping] = useState<CsvColumnMapping>(initialMapping); const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    // Browser storage is read after hydration to keep server-rendered markup deterministic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCatalog(loadRoadmapCatalog()); setProgress(loadRoadmapProgress()); setLoading(false);
  }, []);
  useEffect(() => { const raw = window.location.hash.replace(/^#problem-/, ""); const timer = window.setTimeout(() => { try { setTargetProblemId(decodeURIComponent(raw)); } catch { setTargetProblemId(""); } }, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => {
    if (!targetProblemId || loading) return;
    const timer = window.setTimeout(() => document.getElementById(`problem-${targetProblemId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    return () => window.clearTimeout(timer);
  }, [targetProblemId, loading, catalog]);
  const chapters = useMemo(() => [...new Set(catalog.sections.map((section) => section.chapter))], [catalog.sections]);
  const allProblems = useMemo(() => catalog.sections.flatMap((section) => section.topics), [catalog.sections]);
  const counts = countRoadmapProgress(catalog, progress);
  const sheetCounts = catalog.sections.filter((section) => section.topics.length > 0).reduce((total, section) => ({ solved: total.solved + section.reportedCompleted, total: total.total + section.reportedTotal }), { solved: 0, total: 0 });
  const csvMapped = useMemo(() => importMode?.type === "csv" ? mapCsvRows(importMode.table, mapping) : null, [importMode, mapping]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleSections = useMemo(() => catalog.sections.map((section) => {
    let topics = sourceOrder(section.topics).filter((problem) => {
      const matchesText = !normalizedQuery || problem.name.toLocaleLowerCase().includes(normalizedQuery) || section.name.toLocaleLowerCase().includes(normalizedQuery) || section.chapter.toLocaleLowerCase().includes(normalizedQuery);
      const matchesDifficulty = difficultyFilter === "all" || (difficultyFilter === "unknown" ? problem.level === null : problem.level === difficultyFilter);
      const matchesStatus = statusFilter === "all" || getProblemProgress(progress, problem.id).status === statusFilter;
      return matchesText && matchesDifficulty && matchesStatus;
    });
    if (sortOrder === "name") topics = [...topics].sort((a, b) => a.name.localeCompare(b.name));
    return { ...section, topics };
  }).filter((section) => section.topics.length > 0 || (!normalizedQuery && statusFilter === "all" && difficultyFilter === "all" && section.topics.length === 0)), [catalog.sections, normalizedQuery, statusFilter, difficultyFilter, sortOrder, progress]);
  const visibleProblemIds = new Set(visibleSections.flatMap((section) => section.topics.map((problem) => problem.id)));
  const nextProblem = allProblems.find((problem) => visibleProblemIds.has(problem.id) && getProblemProgress(progress, problem.id).status !== "solved");

  function updateProgress(problemId: string, change: Partial<ProblemProgress> | ((current: ProblemProgress) => ProblemProgress)) {
    const current = getProblemProgress(progress, problemId); const updated = typeof change === "function" ? change(current) : { ...current, ...change };
    const now = new Date().toISOString(); const solvedAt = updated.status === "solved" ? current.status === "solved" ? current.solvedAt ?? now : now : current.solvedAt; const next: RoadmapProgressRecord = { version: 1, updatedAt: now, problems: { ...progress.problems, [problemId]: { ...updated, ...(solvedAt ? { solvedAt } : {}), updatedAt: now } } };
    const result = saveRoadmapProgress(next);
    if (!result.ok) { setError(result.message); setMessage(""); return false; }
    setProgress(next); setError(""); setMessage("Progress saved on this device."); return true;
  }

  function updateSectionStatus(sectionId: string, status: ProblemStatus) {
    const section = catalog.sections.find((item) => item.id === sectionId);
    if (!section?.topics.length) return;
    const now = new Date().toISOString();
    const problems = { ...progress.problems };
    for (const problem of section.topics) {
      const current = getProblemProgress(progress, problem.id);
      problems[problem.id] = { ...current, status, ...(status === "solved" ? { solvedAt: current.status === "solved" ? current.solvedAt ?? now : now } : {}), updatedAt: now };
    }
    const next: RoadmapProgressRecord = { version: 1, updatedAt: now, problems };
    const result = saveRoadmapProgress(next);
    if (!result.ok) { setError(result.message); setMessage(""); return; }
    setProgress(next); setError(""); setMessage(status === "solved" ? `All ${section.topics.length} problems in “${section.name}” marked done.` : `Done marks cleared for “${section.name}”.`);
  }

  async function loadImportFile(file?: File) {
    if (!file) return;
    setImportName(file.name); setError(""); setMessage(""); setImportMode(null); setImportBusy(true);
    try {
      const text = await file.text();
      if (/\.csv$/i.test(file.name) || text.split(/\r?\n/, 1)[0].includes(",")) {
        const table = parseCsv(text); setImportMode({ type: "csv", table });
        const headers = table.headers.map((header) => header.trim().toLocaleLowerCase());
        const find = (patterns: string[]) => { const index = headers.findIndex((header) => patterns.some((pattern) => header === pattern || header.includes(pattern))); return index < 0 ? null : index; };
        setMapping({ chapter: find(["chapter", "unit"]), section: find(["section", "topic", "category"]) ?? -1, problem: find(["problem", "title", "name"]) ?? -1, sourceId: find(["source id", "problem id", "external id"]), difficulty: find(["difficulty", "level"]), url: find(["url", "link"]), durationMinutes: find(["duration", "minutes", "estimate"]), order: find(["order", "sequence", "position"]) });
      } else setImportMode({ type: "outline", preview: parseStriverOutline(text) });
    } catch { setError("The selected file could not be read. Choose a UTF-8 text or CSV file and try again."); }
    finally { setImportBusy(false); }
  }

  function confirmImport() {
    if (!importMode) return;
    setImportBusy(true); setError(""); setMessage(""); const base = loadRoadmapCatalog();
    let next: RoadmapCatalog; let summary: { imported: number; updated: number; skipped: number; failed: number };
    if (importMode.type === "outline") {
      const merged = mergeOutlineImport(base, importMode.preview, new Set(importMode.preview.errors.map((issue) => issue.line)).size);
      next = { ...merged.catalog, sourceFile: importName }; summary = merged.counts;
    } else if (csvMapped) {
      const merged = mergeCsvRows(base, csvMapped.rows, csvMapped.failedRows);
      next = { ...merged.catalog, source: `CSV import · ${importName}`, sourceFile: importName }; summary = merged.counts;
    } else { setImportBusy(false); setError("Select a readable text or CSV file before importing."); return; }
    const saved = saveRoadmapCatalog(next);
    if (!saved.ok) { setError(saved.message); setImportBusy(false); return; }
    setCatalog(next); setMessage(`Import complete · ${summary.imported} imported · ${summary.updated} updated · ${summary.skipped} unchanged · ${summary.failed} failed rows. Existing catalogue entries and progress were preserved.`); setImportMode(null); setImportBusy(false);
  }

  if (loading) return <div className="panel roadmap-loading" role="status"><LoaderCircle size={17} className="spin"/> Loading your saved roadmap…</div>;

  return <>
    <div className="roadmap-import-summary"><div className="roadmap-import-icon"><ListChecks size={19}/></div><div><strong>{catalog.source === DEFAULT_ROADMAP_CATALOG.source ? "Imported from your Striver sheet" : catalog.source}</strong><p>{chapters.length} chapters · {allProblems.length} problem entries · source sheet counters: {sheetCounts.solved}/{sheetCounts.total} · local demo data stored in this browser</p></div><span className="roadmap-source-pill">LOCAL DEMO</span></div>
    <div className="roadmap-progress-panel panel"><div className="roadmap-progress-heading"><div><span className="muted">Your saved progress</span><strong>{counts.solved} <small>/ {counts.total} solved</small></strong></div><span className="roadmap-percent">{counts.percent}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${counts.percent}%` }}/></div><div className="roadmap-counts"><span>{counts.attempted} attempted</span><span>{counts.remaining} remaining</span><span>Only “Solved” counts as complete</span></div></div>
    <section className="roadmap-next panel"><div><span className="eyebrow">WHAT’S NEXT · IN SHEET ORDER</span><strong>{nextProblem ? "Continue with the next problem" : normalizedQuery || statusFilter !== "all" || difficultyFilter !== "all" ? "No matching unsolved problems" : "A2Z roadmap complete"}</strong><small>{nextProblem ? "The next unsolved entry is highlighted in the roadmap below." : "Adjust the filters or keep up the great work."}</small></div><div className="roadmap-next-actions">{nextProblem && <button type="button" className="button-secondary" aria-label={`Continue with ${nextProblem.name}`} onClick={() => setTargetProblemId(nextProblem.id)}>Continue in A2Z</button>}<Link className="button-primary" href="/planner#today-roadmap">Plan my next session <ArrowRight size={14}/></Link></div></section>
    {message && <div className="roadmap-success" role="status"><Check size={14}/>{message}</div>}{error && <div className="roadmap-error" role="alert"><AlertCircle size={15}/>{error}</div>}
    <details className="roadmap-importer panel"><summary><span><FileUp size={16}/> Import or review roadmap data</span><ChevronDown size={15}/></summary><div className="roadmap-importer-content"><p>Upload the original outline format (.txt) or a CSV export. Review the preview and confirm a non-destructive merge. Missing rows never delete saved entries or progress.</p><label className="roadmap-file"><Upload size={15}/><span>{importBusy ? "Reading file…" : importName || "Choose a .txt or .csv file"}</span><input type="file" accept=".txt,.csv,text/plain,text/csv" disabled={importBusy} onChange={(event) => void loadImportFile(event.target.files?.[0])}/></label>
      {importMode?.type === "outline" && <div className="import-preview"><strong>Outline preview</strong><p>{importMode.preview.sections.length} sections · {importMode.preview.sections.reduce((sum, section) => sum + section.topics.length, 0)} problem entries · {importMode.preview.contests.length} contests</p><small>Available fields: source section names, order, problem labels, Basic/Core/Pro tags, section counters, contest durations. No problem URLs or individual completion marks are present.</small><ul className="import-preview-items">{importMode.preview.sections.flatMap((section) => section.topics.map((problem) => ({ section: section.name, problem }))).slice(0, 10).map(({ section, problem }) => <li key={problem.sourceKey}><span>{section}</span><strong>{problem.sourceLabel}</strong><small>{problem.level ?? "Difficulty unavailable"}</small></li>)}</ul>{importMode.preview.warnings.length > 0 && <details><summary>{importMode.preview.warnings.length} warnings</summary><IssueList issues={importMode.preview.warnings}/></details>}{importMode.preview.errors.length > 0 && <details><summary>{importMode.preview.errors.length} errors</summary><IssueList issues={importMode.preview.errors}/></details>}<button className="small-action" type="button" onClick={confirmImport} disabled={importBusy}>{importBusy ? "Saving…" : "Confirm merge import"}</button></div>}
      {importMode?.type === "csv" && <div className="import-preview"><strong>CSV column mapping</strong><p>{importMode.table.rows.length} data rows detected. Map the fields before confirming; invalid rows and values are listed for review.</p><div className="csv-mapping">{(["chapter", "section", "problem", "sourceId", "difficulty", "url", "durationMinutes", "order"] as const).map((field) => <label key={field}>{field === "durationMinutes" ? "Duration (minutes)" : field === "sourceId" ? "Stable source ID (if supplied)" : field[0].toUpperCase() + field.slice(1)}<select value={mapping[field] ?? ""} onChange={(event) => setMapping((value) => ({ ...value, [field]: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">Not mapped</option>{importMode.table.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>{csvMapped && <><small>Preview · {csvMapped.rows.length} mapped rows · {csvMapped.failedRows} rows failed validation · missing links or time estimates will remain unavailable.</small><div className="csv-preview-table"><div><b>Section</b><b>Problem</b><b>URL</b><b>Minutes</b></div>{csvMapped.rows.slice(0, 8).map((row) => <div key={row.sourceKey}><span>{row.section}</span><span>{row.name}</span><span>{row.url || "Not available"}</span><span>{row.estimatedMinutes ?? "Not available"}</span></div>)}</div>{csvMapped.warnings.length > 0 && <details><summary>{csvMapped.warnings.length} warnings</summary><IssueList issues={csvMapped.warnings}/></details>}{csvMapped.errors.length > 0 && <details><summary>{csvMapped.errors.length} errors / row issues</summary><IssueList issues={csvMapped.errors}/></details>}<button className="small-action" type="button" onClick={confirmImport} disabled={importBusy || mapping.section < 0 || mapping.problem < 0}>{importBusy ? "Saving…" : "Confirm merge import"}</button></>}</div>}
    </div></details>
    <div className="roadmap-tools"><label className="roadmap-search"><Search size={16}/><span className="sr-only">Search roadmap entries</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search problem names and sections"/></label><label className="roadmap-filter">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="not-started">Not started</option><option value="attempted">Attempted</option><option value="solved">Solved</option></select></label><label className="roadmap-filter">Level<select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}><option value="all">All levels</option><option value="basic">Basic</option><option value="core">Core</option><option value="pro">Pro</option><option value="unknown">Not tagged</option></select></label><label className="roadmap-filter">Sort<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option value="source">Sheet order</option><option value="name">Name A–Z</option></select></label></div>
    {allProblems.length === 0 ? <div className="roadmap-empty" role="status">No roadmap problems have been imported yet. Use the importer above to preview and add a text or CSV roadmap.</div> : visibleSections.length === 0 ? <div className="roadmap-empty" role="status">No problems match these filters. Clear search and return filters to restore the original sheet order.</div> : <div className="roadmap-chapters">{chapters.map((chapter, index) => {
      const chapterSections = visibleSections.filter((section) => section.chapter === chapter); if (!chapterSections.length) return null;
      const chapterCount = countChapterProgress(catalog.sections, chapter, progress);
      const contests = catalog.contests.filter((contest) => contest.chapter === chapter);
      const autoOpenSections = normalizedQuery.length > 0 || statusFilter !== "all" || difficultyFilter !== "all";
      return <RoadmapChapter key={`${chapter}-${autoOpenSections ? normalizedQuery + statusFilter + difficultyFilter : "source"}`} index={index} chapter={chapter} sections={chapterSections} allSections={catalog.sections} contests={contests} counts={chapterCount} progress={progress} initiallyOpen={autoOpenSections || index === 0} targetProblemId={targetProblemId} onStatus={(id, status) => updateProgress(id, { status })} onBulkStatus={updateSectionStatus} onSave={updateProgress} autoOpenSections={autoOpenSections}/>;
    })}</div>}
    <div className="roadmap-import-note"><ExternalLink size={14}/><span>Links and per-problem durations are “Not available” until supplied in a CSV or edited on the problem. Source-sheet section counters are separate from your personal saved progress.</span></div>
  </>;
}

function IssueList({ issues }: { issues: ImportIssue[] }) { return <ul className="import-issue-list">{issues.map((issue, index) => <li key={`${issue.line}-${index}`}><strong>Line {issue.line}:</strong> {issue.message} <code>{issue.value}</code></li>)}</ul>; }

function RoadmapChapter({ index, chapter, sections, allSections, contests, counts, progress, initiallyOpen, targetProblemId, autoOpenSections, onStatus, onBulkStatus, onSave }: { index: number; chapter: string; sections: RoadmapSection[]; allSections: RoadmapSection[]; contests: RoadmapCatalog["contests"]; counts: ReturnType<typeof countRoadmapProgress>; progress: RoadmapProgressRecord; initiallyOpen: boolean; targetProblemId: string; autoOpenSections: boolean; onStatus: (id: string, status: ProblemStatus) => void; onBulkStatus: (sectionId: string, status: ProblemStatus) => void; onSave: (id: string, change: Partial<ProblemProgress> | ((current: ProblemProgress) => ProblemProgress)) => boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => { if (!targetProblemId || !sections.some((section) => section.topics.some((problem) => problem.id === targetProblemId))) return; const timer = window.setTimeout(() => setOpen(true), 0); return () => window.clearTimeout(timer); }, [targetProblemId, sections]);
  return <details className="roadmap-chapter panel" open={open} onToggle={(event) => { const nextOpen = event.currentTarget.open; if (nextOpen !== open) setOpen(nextOpen); }}><summary><span className="roadmap-chapter-number">{String(index + 1).padStart(2, "0")}</span><span className="roadmap-chapter-title"><strong>{chapter}</strong><small>{counts.solved} / {counts.total} solved · {counts.attempted} attempted</small></span><span className="roadmap-chapter-count">{counts.percent}% <ChevronDown size={15}/></span></summary><div className="roadmap-sections">{sections.map((section) => { const allTopics = allSections.find((item) => item.id === section.id)?.topics ?? section.topics; return <SectionBlock key={`${section.id}-${autoOpenSections ? `${section.topics.length}` : "source"}`} section={section} allTopics={allTopics} visibleTopics={section.topics} progress={progress} initiallyOpen={autoOpenSections} targetProblemId={targetProblemId} onStatus={onStatus} onBulkStatus={onBulkStatus} onSave={onSave}/>; })}{contests.length > 0 && <div className="roadmap-contests"><strong>Practice contests</strong>{sourceOrder(contests).map((contest) => <span key={contest.id}>{contest.problemCount === null ? "Contest details need review" : `${contest.problemCount} problems`} · {contest.durationMinutes === null ? "Duration unavailable" : `${Math.floor(contest.durationMinutes / 60)} hours`}</span>)}</div>}</div></details>;
}

function SectionBlock({ section, allTopics, visibleTopics, progress, initiallyOpen, targetProblemId, onStatus, onBulkStatus, onSave }: { section: RoadmapSection; allTopics: RoadmapProblem[]; visibleTopics: RoadmapProblem[]; progress: RoadmapProgressRecord; initiallyOpen: boolean; targetProblemId: string; onStatus: (id: string, status: ProblemStatus) => void; onBulkStatus: (sectionId: string, status: ProblemStatus) => void; onSave: (id: string, change: Partial<ProblemProgress> | ((current: ProblemProgress) => ProblemProgress)) => boolean }) {
  const [open, setOpen] = useState(initiallyOpen);
  useEffect(() => { if (!targetProblemId || !section.topics.some((problem) => problem.id === targetProblemId)) return; const timer = window.setTimeout(() => setOpen(true), 0); return () => window.clearTimeout(timer); }, [targetProblemId, section.topics]);
  const counts = countSectionProgress(section, progress);
  const solved = allTopics.filter((problem) => getProblemProgress(progress, problem.id).status === "solved").length;
  const allSolved = allTopics.length > 0 && solved === allTopics.length;
  const partiallySolved = solved > 0 && !allSolved;
  return <details className="roadmap-section" open={open} onToggle={(event) => { const nextOpen = event.currentTarget.open; if (nextOpen !== open) setOpen(nextOpen); }}>
    <summary><span className="roadmap-section-heading"><span><strong>{section.name}</strong><small>{counts.solved} / {counts.total} solved · {counts.attempted} attempted · {counts.percent}%</small></span><span>{section.reportedTotal ? `Sheet: ${section.reportedCompleted} / ${section.reportedTotal}` : "Sheet counts: Not available"}</span></span><span className="progress-track roadmap-section-progress"><span className="progress-fill" style={{ width: `${counts.percent}%` }}/></span></summary>
    {allTopics.length > 0 && <div className="roadmap-bulk-row"><label><input type="checkbox" checked={allSolved} aria-label={`Mark all problems in ${section.name} done`} ref={(element) => { if (element) element.indeterminate = partiallySolved; }} onChange={(event) => onBulkStatus(section.id, event.target.checked ? "solved" : "not-started")}/><span>Mark every problem in this topic done</span><small>{solved} / {allTopics.length}</small></label></div>}
    {open && (visibleTopics.length > 0 ? <ul>{visibleTopics.map((problem) => <ProblemRow key={`${problem.id}-${getProblemProgress(progress, problem.id).updatedAt}`} problem={problem} progress={getProblemProgress(progress, problem.id)} onStatus={(status) => onStatus(problem.id, status)} onSave={(change) => onSave(problem.id, change)}/>)}</ul> : <p className="roadmap-section-empty">This source section has summary counts but no individual problem names in the text export.</p>)}
  </details>;
}

function ProblemRow({ problem, progress, onStatus, onSave }: { problem: RoadmapProblem; progress: ProblemProgress; onStatus: (status: ProblemStatus) => void; onSave: (change: Partial<ProblemProgress> | ((current: ProblemProgress) => ProblemProgress)) => boolean }) {
  const [draft, setDraft] = useState({ notes: progress.notes, minutesSpent: String(progress.minutesSpent || ""), estimatedMinutes: String(progress.estimatedMinutes ?? problem.estimatedMinutes ?? ""), url: progress.url || problem.url || "", attemptMinutes: "" });
  const [detailError, setDetailError] = useState("");
  function saveDetails() {
    const minutesSpent = Number(draft.minutesSpent || 0); const estimatedMinutes = draft.estimatedMinutes ? Number(draft.estimatedMinutes) : null;
    if (!Number.isInteger(minutesSpent) || minutesSpent < 0) { setDetailError("Enter a non-negative whole number of minutes."); return; }
    if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 1440)) { setDetailError("Estimate must be from 1 to 1440 minutes."); return; }
    if (draft.url && !isValidExternalUrl(draft.url)) { setDetailError("Use a valid http or https URL."); return; }
    setDetailError(""); onSave({ notes: draft.notes, minutesSpent, estimatedMinutes, url: draft.url.trim() });
  }
  function logAttempt() {
    const minutes = Number(draft.attemptMinutes || 0); if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) { setDetailError("Attempt time must be a whole number from 0 to 1440 minutes."); return; }
    setDetailError("");
    const ok = onSave((current) => ({ ...current, status: current.status === "solved" ? current.status : "attempted", minutesSpent: current.minutesSpent + minutes, attempts: [...current.attempts, { id: createRoadmapId(), occurredAt: new Date().toISOString(), minutes }] }));
    if (ok) setDraft((value) => ({ ...value, attemptMinutes: "", minutesSpent: String(progress.minutesSpent + minutes) }));
  }
  const level = problem.level ?? "unknown";
  const estimate = progress.estimatedMinutes ?? problem.estimatedMinutes;
  const estimateSource = progress.estimatedMinutes !== null ? "your custom estimate" : problem.estimatedMinutes !== null ? "imported metadata" : "not available";
  return <li id={`problem-${problem.id}`} className={`roadmap-problem ${progress.status === "solved" ? "is-solved" : ""}`}><div className="roadmap-problem-main"><label className="problem-status-label"><input type="checkbox" aria-label={`Done: ${problem.name}`} checked={progress.status === "solved"} onChange={(event) => onStatus(event.target.checked ? "solved" : "not-started")}/><span className="sr-only">{progress.status === "solved" ? "Done" : "Not done"}</span></label><span className="roadmap-topic-name">{problem.name}</span>{problem.level ? <span className={`roadmap-level ${level}`}>{level}</span> : <span className="roadmap-level unknown">No level</span>}<details className="problem-actions"><summary aria-label={`Problem details: ${problem.name}`}>Details</summary><div className="problem-detail-panel"><div className="problem-inline-meta"><span>Stable problem ID <code>{problem.id}</code></span><span>Estimate: {estimate ?? "Not available"}{estimate !== null ? ` min · ${estimateSource}` : ""}</span><span>{progress.minutesSpent} minutes spent · {progress.attempts.length} attempts</span></div><label>Problem URL<input type="url" inputMode="url" placeholder="https://… or leave empty" value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })}/></label><label>Custom estimate (minutes)<input type="number" min={1} max={1440} step={1} placeholder="Not available" value={draft.estimatedMinutes} onChange={(event) => setDraft({ ...draft, estimatedMinutes: event.target.value })}/></label><label>Total time spent (minutes)<input type="number" min={0} step={1} value={draft.minutesSpent} onChange={(event) => setDraft({ ...draft, minutesSpent: event.target.value })}/></label><label>Notes<textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Personal notes saved on this device"/></label><div className="problem-detail-actions"><button type="button" className="small-action" onClick={saveDetails}>Save details</button><label>Attempt time (minutes)<input type="number" min={0} max={1440} value={draft.attemptMinutes} onChange={(event) => setDraft({ ...draft, attemptMinutes: event.target.value })}/></label><button type="button" className="small-action" onClick={logAttempt}>Log attempt</button></div>{detailError && <span className="roadmap-error" role="alert">{detailError}</span>}{draft.url && isValidExternalUrl(draft.url) ? <a href={draft.url} target="_blank" rel="noreferrer noopener">Open problem link <ExternalLink size={13}/></a> : <span className="muted">Problem link: Not available</span>}</div></details><span className="problem-row-status">{progress.status === "solved" ? "Done" : "Not done"}</span></div></li>;
}
