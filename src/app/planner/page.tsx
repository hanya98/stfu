"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Check, Clock3, ExternalLink, RefreshCw, RotateCcw, SkipForward, Target, WandSparkles } from "lucide-react";
import { PageTitle } from "@/components/ui";
import { generateRoadmapSchedule, localDayKey, mergeGeneratedSchedule, reconcileSolvedTasks, type PlannerRecord, type PlannerTask } from "@/lib/planner/engine";
import { EMPTY_PLANNER, loadPlannerRecord, savePlannerRecord, updatePlannerTask } from "@/lib/planner/storage";
import { loadOnboardingRecord } from "@/lib/onboarding/storage";
import { DEFAULT_ROADMAP_CATALOG, loadRoadmapCatalog } from "@/lib/roadmap/catalog-storage";
import { loadRoadmapProgress, saveRoadmapProgress, getProblemProgress } from "@/lib/roadmap/progress";
import type { RoadmapCatalog } from "@/lib/roadmap/types";
import type { OnboardingRecord } from "@/lib/onboarding/types";

const todayKey = () => localDayKey(new Date());

export default function Planner() {
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [catalog, setCatalog] = useState<RoadmapCatalog>(DEFAULT_ROADMAP_CATALOG);
  const [planner, setPlanner] = useState<PlannerRecord>(EMPTY_PLANNER);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    const onboarding = loadOnboardingRecord();
    const nextCatalog = loadRoadmapCatalog();
    const current = loadPlannerRecord();
    setRecord(onboarding); setCatalog(nextCatalog);
    if (onboarding?.completed) {
      const progress = loadRoadmapProgress();
      const reconciled = reconcileSolvedTasks(current, progress);
      const missedIds = new Set(current.tasks.filter((task) => task.date < todayKey() && task.status === "planned").map((task) => task.problemId));
      const generated = generateRoadmapSchedule(onboarding.answers, nextCatalog, progress, new Date(), missedIds);
      const next = mergeGeneratedSchedule(reconciled, generated, todayKey());
      const saved = savePlannerRecord(next);
      if (saved.ok) setPlanner(next); else { setPlanner(current); setError(saved.message); }
    } else setPlanner(current);
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(refresh, 0); return () => window.clearTimeout(timer); }, [refresh]);
  const todayTasks = useMemo(() => planner.tasks.filter((task) => task.date === todayKey() && ["planned", "attempted", "completed"].includes(task.status)), [planner]);
  const missed = useMemo(() => planner.tasks.filter((task) => task.date < todayKey() && task.status === "planned"), [planner]);
  const upcoming = useMemo(() => planner.tasks.filter((task) => task.date > todayKey() && ["planned", "attempted"].includes(task.status)).slice(0, 5), [planner]);
  const completeCount = planner.tasks.filter((task) => task.status === "completed").length;
  const plannedMinutes = todayTasks.reduce((sum, task) => sum + task.minutes, 0);
  const dailyCapacity = record?.answers.minutesPerDay ?? 0;
  const solvedCount = Object.values(loadRoadmapProgress().problems).filter((item) => item.status === "solved").length;

  function persist(next: PlannerRecord, message: string) {
    const saved = savePlannerRecord(next);
    if (!saved.ok) { setError(saved.message); setNotice(""); return false; }
    setPlanner(next); setError(""); setNotice(message); return true;
  }

  function generate(fromDate = todayKey(), recovery = false) {
    if (!record?.completed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const progress = loadRoadmapProgress();
      const missedIds = recovery ? new Set<string>() : new Set(planner.tasks.filter((task) => task.date < fromDate && task.status === "planned").map((task) => task.problemId));
      const generated = generateRoadmapSchedule(record.answers, catalog, progress, new Date(`${fromDate}T12:00:00`), missedIds);
      let next = mergeGeneratedSchedule(planner, generated, fromDate);
      if (recovery) next = { ...next, tasks: next.tasks.map((task) => task.date < fromDate && task.status === "planned" ? { ...task, status: "rescheduled" } : task) };
      persist(next, recovery ? "Unfinished tasks were redistributed across upcoming study days. Their original dates remain in your history." : "The plan was refreshed from your current roadmap progress and preferences.");
    } catch { setError("Plan generation failed. Your saved tasks are unchanged; try again."); }
    finally { setBusy(false); }
  }

  function catchUpOne() {
    if (!record?.completed || !missed.length) return;
    const target = [...missed].sort((left,right) => left.date.localeCompare(right.date))[0];
    const alreadyQueued = planner.tasks.some((task) => task.problemId === target.problemId && task.date >= todayKey() && ["planned", "attempted"].includes(task.status));
    if (alreadyQueued) {
      const next = { ...planner, tasks: planner.tasks.map((task) => task.id === target.id ? { ...task, status: "rescheduled" as const } : task) };
      persist(next, `“${target.title}” already has a future session. Its missed date is kept in history and the future task was not duplicated.`);
      return;
    }
    for (let offset = 0; offset < 3650; offset++) {
      const date = new Date(); date.setDate(date.getDate() + offset); const dateKey = localDayKey(date);
      if (!record.answers.studyDays.includes(date.getDay())) continue;
      const dayTasks = planner.tasks.filter((task) => task.date === dateKey && ["planned", "attempted", "completed"].includes(task.status));
      const occupied = dayTasks.reduce((sum,task) => sum + task.minutes,0);
      const id = `${target.problemId}@${dateKey}`;
      if (planner.tasks.some((task) => task.id === id)) continue;
      if (occupied + target.minutes <= record.answers.minutesPerDay) {
        const replacement: PlannerTask = { ...target, id, date: dateKey, status: "planned", completedAt: undefined };
        const next = { ...planner, tasks: [...planner.tasks.map((task) => task.id === target.id ? { ...task, status: "rescheduled" as const } : task), replacement] };
        persist(next, `One missed task was placed on ${dateKey}. Its original date is preserved; other missed tasks remain queued.`); return;
      }
      const candidates = dayTasks.filter((task) => task.status === "planned").reverse();
      for (const displaced of candidates) {
        if (occupied - displaced.minutes + target.minutes > record.answers.minutesPerDay) continue;
        for (let pushOffset = offset + 1; pushOffset < offset + 3650; pushOffset++) {
          const pushDate = new Date(); pushDate.setDate(pushDate.getDate() + pushOffset); const pushDateKey = localDayKey(pushDate);
          if (record.answers.targetCompletionDate && pushDateKey > record.answers.targetCompletionDate) break;
          if (!record.answers.studyDays.includes(pushDate.getDay())) continue;
          const pushTasks = planner.tasks.filter((task) => task.date === pushDateKey && task.id !== displaced.id && ["planned", "attempted", "completed"].includes(task.status));
          const pushOccupied = pushTasks.reduce((sum,task) => sum + task.minutes,0);
          const pushId = `${displaced.problemId}@${pushDateKey}`;
          if (pushOccupied + displaced.minutes > record.answers.minutesPerDay || planner.tasks.some((task) => task.id === pushId)) continue;
          const catchUp: PlannerTask = { ...target, id, date: dateKey, status: "planned", completedAt: undefined };
          const shifted: PlannerTask = { ...displaced, id: pushId, date: pushDateKey, status: "planned", completedAt: undefined };
          const next = { ...planner, tasks: [...planner.tasks.map((task) => task.id === target.id || task.id === displaced.id ? { ...task, status: "rescheduled" as const } : task), catchUp, shifted] };
          persist(next, `One missed task was added on ${dateKey}; one planned task moved to ${pushDateKey} to keep within your daily limit. Original dates remain in history.`); return;
        }
      }
    }
    setError(`No open slot could be found before your target date. Keep it queued, extend the target, or adjust your available study time.`);
  }

  function setTaskStatus(task: PlannerTask, status: "completed" | "attempted" | "skipped") {
    const next = updatePlannerTask(planner, task.id, status);
    if (!persist(next, status === "completed" ? `Completed “${task.title}”.` : `Marked “${task.title}” ${status}.`)) return;
    if ((status === "completed" && task.kind !== "revision") || status === "attempted") {
      const progress = loadRoadmapProgress(); const current = getProblemProgress(progress, task.problemId); const now = new Date().toISOString();
      const nextStatus = status === "completed" ? "solved" : current.status === "solved" ? "solved" : "attempted";
      const saved = saveRoadmapProgress({ ...progress, updatedAt: now, problems: { ...progress.problems, [task.problemId]: { ...current, status: nextStatus, ...(nextStatus === "solved" ? { solvedAt: current.status === "solved" ? current.solvedAt ?? now : now } : {}), updatedAt: now } } });
      if (!saved.ok) setError(`Planner status saved, but roadmap progress could not be saved: ${saved.message}`);
    }
  }

  if (loading) return <div role="status" className="panel planner-state"><span className="planner-spinner"/> Loading your saved plan…</div>;
  if (!record?.completed) return <><PageTitle eyebrow="PERSONALISED DAILY PLAN" title="Your next session starts here." description="Complete or resume onboarding to build a schedule from your selected A2Z roadmap."/><section className="panel planner-empty"><Target size={20} color="var(--green)"/><h2>No plan preferences yet</h2><p>Once you save your study days and available time, Planly can place real roadmap problems into your calendar.</p><Link href="/onboarding" className="button-primary">Set up your plan <ArrowRight size={14}/></Link></section></>;

  const schedule = generateRoadmapSchedule(record.answers, catalog, loadRoadmapProgress());
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
  return <>
    <PageTitle eyebrow="YOUR DAILY PLAN · LOCAL DEMO" title="A focused session, ready when you are." description={`${todayLabel} · ${record.answers.roadmap} · ${record.answers.language}`} action={{ label: "Edit preferences", href: "/settings" }}/>
    {error && <div className="planner-alert error" role="alert">{error}</div>}{notice && <div className="planner-alert success" role="status">{notice}</div>}
    <div className="planner-summary-grid"><div className="panel planner-metric"><span>Today’s planned time</span><strong>{plannedMinutes} <small>/ {dailyCapacity} min</small></strong><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.min(100, dailyCapacity ? plannedMinutes / dailyCapacity * 100 : 0)}%` }}/></div></div><div className="panel planner-metric"><span>Remaining roadmap workload</span><strong>{schedule.workloadMinutes.toLocaleString()} <small>min · estimate</small></strong><small>~{Number.isFinite(schedule.estimatedWeeks) ? schedule.estimatedWeeks : "—"} study weeks</small></div><div className="panel planner-metric"><span>Roadmap progress</span><strong>{solvedCount} <small>problems solved</small></strong><small>{completeCount} planned sessions completed</small></div></div>
    {missed.length > 0 && <section className="panel planner-recovery"><div className="planner-section-heading"><div><span className="eyebrow">PLAN NEEDS YOUR INPUT</span><h2>{missed.length} unfinished task{missed.length === 1 ? "" : "s"} from earlier days</h2><p>Completed work and original dates are preserved. Choose how to handle the remaining practice.</p></div><RotateCcw size={19} color="var(--green)"/></div><div className="planner-actions"><button className="button-primary" type="button" disabled={busy} onClick={() => generate(todayKey(), true)}>Redistribute all across future study days</button><button className="button-secondary" type="button" onClick={catchUpOne}>Catch up on one task</button><button className="button-secondary" type="button" onClick={() => setNotice("Unfinished tasks remain queued here; no missed work was added to today.")}>Keep queued</button><Link className="button-secondary" href="/settings">Adjust my time or target</Link></div><p className="muted planner-footnote">Catch-up moves one task at a time into an open study slot; redistribution spreads all outstanding tasks. Neither action overloads today.</p></section>}
    <div className="planner-layout"><section id="today-roadmap" className="panel planner-list"><div className="planner-section-heading"><div><span className="eyebrow">TODAY · {todayKey()}</span><h2>Today’s roadmap</h2></div><button className="planner-icon-button" type="button" disabled={busy} onClick={() => generate()} aria-label="Regenerate future plan"><RefreshCw size={15}/></button></div>
      {todayTasks.length === 0 ? <div className="planner-empty-inline"><Check size={17} color="var(--green)"/><div><strong>No tasks scheduled for today</strong><p>Today may be a rest day or your selected roadmap work is complete.</p></div></div> : todayTasks.map((task) => <TaskRow key={task.id} task={task} onStatus={setTaskStatus}/>)}
      {todayTasks.length > 0 && <div className="planner-total"><span>{todayTasks.filter((task) => task.status === "completed").length} of {todayTasks.length} completed</span><span>{plannedMinutes} min planned · {dailyCapacity} min available</span></div>}
      <div className="planner-actions planner-bottom-actions"><button className="button-secondary" type="button" disabled={busy} onClick={() => generate()}><WandSparkles size={14}/>{busy ? "Generating…" : "Regenerate future plan"}</button><Link href="/roadmap" className="button-secondary">Open roadmap <ArrowRight size={13}/></Link></div>
    </section><aside className="planner-side"><section className="panel planner-side-panel"><div className="planner-section-heading"><div><span className="eyebrow">UP NEXT</span><h2>Upcoming sessions</h2></div><BookOpen size={17} color="var(--green)"/></div>{upcoming.length ? upcoming.map((task) => <div className="planner-upcoming" key={task.id}><time>{new Intl.DateTimeFormat(undefined,{weekday:"short",month:"short",day:"numeric"}).format(new Date(`${task.date}T12:00:00`))}</time><span>{task.title}</span><small>{task.minutes}m</small></div>) : <p className="muted">No upcoming tasks have been generated.</p>}</section><section className="panel planner-side-panel"><span className="eyebrow">ESTIMATE · NOT A PROMISE</span><h2>{schedule.estimatedCompletionDate ? new Intl.DateTimeFormat(undefined,{month:"short",day:"numeric",year:"numeric"}).format(new Date(`${schedule.estimatedCompletionDate}T12:00:00`)) : "No remaining topics"}</h2><p className="muted">Estimated completion at your current availability: {Number.isFinite(schedule.estimatedWeeks) ? `${schedule.estimatedWeeks} weeks` : "unavailable"}.</p>{schedule.feasibleByDeadline === false && <div className="planner-alert warning">Your target date appears tighter than the estimated workload allows. Consider extending the date, adding study time, or selecting fewer topics.</div>}<details className="planner-assumptions"><summary>How this estimate is calculated</summary><ul>{schedule.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></details></section></aside></div>
    <p className="muted demo-footnote">Local demo data is stored in this browser only. Refreshing preserves your plan and problem progress.</p>
  </>;
}

function TaskRow({ task, onStatus }: { task: PlannerTask; onStatus: (task: PlannerTask, status: "completed" | "attempted" | "skipped") => void }) {
  return <article className={`planner-task ${task.status === "completed" ? "done" : ""}`}><div className="planner-task-time"><Clock3 size={13}/>{task.minutes}m</div><div className="planner-task-content"><div className="planner-task-title">{task.title}{task.kind === "revision" && <span className="planner-revision-tag">Revision</span>}</div><p>{task.chapter} · {task.section}{task.preferredTime ? ` · Preferred: ${task.preferredTime}` : ""}</p><div className="planner-task-links"><Link href={`/roadmap#problem-${encodeURIComponent(task.problemId)}`}>Open roadmap entry <ArrowRight size={12}/></Link>{task.url && <a href={task.url} target="_blank" rel="noreferrer">Problem link <ExternalLink size={12}/></a>}</div></div><div className="planner-task-actions">{task.status !== "completed" && <><button type="button" aria-label={`Mark ${task.title} complete`} onClick={() => onStatus(task,"completed")}><Check size={14}/></button><button type="button" aria-label={`Mark ${task.title} attempted`} onClick={() => onStatus(task,"attempted")}><RotateCcw size={13}/></button><button type="button" aria-label={`Skip ${task.title}`} onClick={() => onStatus(task,"skipped")}><SkipForward size={13}/></button></>}{task.status === "completed" && <span className="planner-complete-label"><Check size={12}/> Done</span>}</div></article>;
}
