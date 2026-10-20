"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Clock3, ExternalLink, RotateCcw } from "lucide-react";
import { PageTitle } from "@/components/ui";
import { loadPlannerRecord, savePlannerRecord } from "@/lib/planner/storage";
import type { PlannerRecord, PlannerTask } from "@/lib/planner/engine";

const todayKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function Revision() {
  const [record, setRecord] = useState<PlannerRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => { setRecord(loadPlannerRecord()); setLoaded(true); }, 0); return () => window.clearTimeout(timer); }, []);

  const reviewTasks = useMemo(() => record?.tasks.filter((task) => task.kind === "revision") ?? [], [record]);
  const today = todayKey();
  const openTasks = reviewTasks.filter((task) => ["planned", "attempted"].includes(task.status));
  const overdue = openTasks.filter((task) => task.date < today);
  const upcoming = openTasks.filter((task) => task.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const completed = reviewTasks.filter((task) => task.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  function updateTask(task: PlannerTask, change: Partial<PlannerTask>, message: string) {
    if (!record) return;
    setError(""); setSuccess("");
    const next = { ...record, tasks: record.tasks.map((item) => item.id === task.id ? { ...item, ...change } : item) };
    const result = savePlannerRecord(next);
    if (!result.ok) { setError(result.message); return; }
    setRecord(next); setSuccess(message);
  }

  return <>
    <PageTitle eyebrow="KEEP CONCEPTS FRESH" title="Revision tracker" description="Review problems from your saved daily plan. Completing a revision never counts as a new A2Z solve." action={{ label: "Open daily plan", href: "/planner" }} />
    {!loaded ? <div className="panel planner-state" role="status"><span className="planner-spinner"/>Loading saved revisions…</div> : <>
      <div className="local-pill" style={{ marginBottom: 12 }}><span/>From your local daily plan · no account sync configured</div>
      {error && <div className="planner-alert error" role="alert">{error}</div>}
      {success && <div className="planner-alert success" role="status">{success}</div>}
      {!reviewTasks.length ? <section className="panel revision-empty"><RotateCcw size={20} color="var(--green)"/><div><strong>No revision sessions yet</strong><p>When you mark a roadmap problem as attempted, Planly can add it back to your daily plan as a revision.</p><Link className="dashboard-link" href="/roadmap">Find a problem to practise <ArrowRight size={13}/></Link></div></section> : <div className="revision-layout">
        <section className="panel revision-list"><div className="revision-heading"><div><span className="eyebrow">NEEDS ATTENTION</span><h2>Missed and overdue</h2></div><strong>{overdue.length}</strong></div>
          {overdue.length ? overdue.map((task) => <RevisionRow key={task.id} task={task} overdue onComplete={() => updateTask(task, { status: "completed", completedAt: new Date().toISOString() }, `${task.title} revision completed.`)} onMove={() => updateTask(task, { date: today, status: "planned" }, `${task.title} moved into today’s review plan.`)}/>) : <RevisionEmpty>No overdue revisions. Missed sessions stay here until you complete or move them.</RevisionEmpty>}
        </section>
        <section className="panel revision-list"><div className="revision-heading"><div><span className="eyebrow">UP NEXT</span><h2>Scheduled reviews</h2></div><strong>{upcoming.length}</strong></div>
          {upcoming.length ? upcoming.map((task) => <RevisionRow key={task.id} task={task} onComplete={() => updateTask(task, { status: "completed", completedAt: new Date().toISOString() }, `${task.title} revision completed.`)} onMove={() => updateTask(task, { date: today, status: "planned" }, `${task.title} moved into today’s review plan.`)}/>) : <RevisionEmpty>No upcoming revisions in your saved plan.</RevisionEmpty>}
        </section>
        <section className="panel revision-list revision-wide"><div className="revision-heading"><div><span className="eyebrow">COMPLETED</span><h2>Review history</h2></div><strong>{completed.length}</strong></div>
          {completed.length ? completed.slice(0, 12).map((task) => <RevisionRow key={task.id} task={task} completed/>) : <RevisionEmpty>Completed review sessions will appear here.</RevisionEmpty>}
        </section>
      </div>}
    </>}
  </>;
}

function RevisionRow({ task, overdue = false, completed = false, onComplete, onMove }: { task: PlannerTask; overdue?: boolean; completed?: boolean; onComplete?: () => void; onMove?: () => void }) {
  const date = new Date(`${task.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return <article className={`revision-row ${overdue ? "is-overdue" : ""} ${completed ? "is-completed" : ""}`}>
    <span className="revision-icon">{completed ? <Check size={14}/> : <RotateCcw size={14}/>}</span>
    <div className="revision-row-body"><Link href={`/roadmap#problem-${encodeURIComponent(task.problemId)}`}>{task.title}</Link><small>{task.chapter} · {task.section} · {task.minutes} min · {completed ? "Completed" : overdue ? `Missed · ${date}` : date}</small></div>
    {task.url && <a className="revision-link" href={task.url} target="_blank" rel="noopener noreferrer" aria-label={`Open problem link for ${task.title}`}><ExternalLink size={13}/></a>}
    {!completed && <div className="revision-actions"><button type="button" onClick={onComplete} aria-label={`Complete revision: ${task.title}`}><Check size={13}/> Done</button>{overdue && <button type="button" onClick={onMove} aria-label={`Move revision to today: ${task.title}`}><Clock3 size={13}/> Today</button>}</div>}
  </article>;
}
function RevisionEmpty({ children }: { children: React.ReactNode }) { return <div className="analytics-empty">{children}</div>; }
