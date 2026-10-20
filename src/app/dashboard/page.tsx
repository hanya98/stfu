"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, Clock3, Flame, LoaderCircle, Target, TrendingUp } from "lucide-react";
import { PageTitle, StatCard } from "@/components/ui";
import { generateRoadmapSchedule, localDayKey, mergeGeneratedSchedule, reconcileSolvedTasks, type PlannerTask } from "@/lib/planner/engine";
import { loadPlannerRecord, savePlannerRecord } from "@/lib/planner/storage";
import { loadOnboardingRecord } from "@/lib/onboarding/storage";
import type { OnboardingRecord } from "@/lib/onboarding/types";
import { loadRoadmapCatalog } from "@/lib/roadmap/catalog-storage";
import { countRoadmapProgress, loadRoadmapProgress } from "@/lib/roadmap/progress";

export default function Dashboard() {
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [plannerTasks, setPlannerTasks] = useState<PlannerTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const onboarding = loadOnboardingRecord(); setRecord(onboarding);
      if (onboarding?.completed) {
        const current = loadPlannerRecord();
        const progress = loadRoadmapProgress();
        const today = localDayKey(new Date());
        const missedIds = new Set(current.tasks.filter((task) => task.date < today && task.status === "planned").map((task) => task.problemId));
        const generated = generateRoadmapSchedule(onboarding.answers, loadRoadmapCatalog(), progress, new Date(), missedIds);
        const next = mergeGeneratedSchedule(reconcileSolvedTasks(current, progress), generated, today);
        const saved = savePlannerRecord(next); setPlannerTasks(next.tasks); if (!saved.ok) setStorageError(saved.message);
      }
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const progress = loaded ? countRoadmapProgress(loadRoadmapCatalog(), loadRoadmapProgress()) : null;
  const plan = record ? generateRoadmapSchedule(record.answers, loadRoadmapCatalog(), loadRoadmapProgress()) : null;
  if (!loaded) return <div role="status" className="panel" style={{ padding: 22, display: "flex", alignItems: "center", gap: 9 }}><LoaderCircle size={16} className="spin"/>Loading your Planly dashboard…</div>;
  if (!record?.completed || !plan) return <><PageTitle eyebrow="YOUR DSA WORKSPACE" title="Start with a plan that fits." description="Set your preparation goal, routine, and roadmap to get a personalised first sprint." action={{ label: "Build your plan", href: "/onboarding" }}/><section className="panel" style={{ padding: 24, maxWidth: 700 }}><div style={{ color: "var(--green)" }}><Target size={20}/></div><h2 style={{ fontSize: 17, margin: "13px 0 8px" }}>Your dashboard will take shape as you go.</h2><p className="muted" style={{ fontSize: 12, lineHeight: 1.7 }}>Complete onboarding to see your selected roadmap, weekly study target, and upcoming A2Z practice.</p><Link className="button-primary" href="/onboarding">Personalise your plan <ArrowRight size={14}/></Link></section></>;
  const today = localDayKey(new Date());
  const nextTasks = plannerTasks.filter((task) => task.date >= today && ["planned", "attempted"].includes(task.status)).slice(0, 4);
  const firstDate = nextTasks[0]?.date;
  const weekly = plannerTasks.filter((task) => task.date >= today && task.date <= localDayKey(new Date(Date.now() + 6 * 86400000)) && ["planned", "attempted", "completed"].includes(task.status));
  const goal = record.answers.goals.map((value) => value === "Custom goal" ? record.answers.customGoal : value).filter(Boolean).join(" · ");
  return <><PageTitle eyebrow="YOUR PERSONAL PLAN · LOCAL DEMO" title="Your DSA journey, in focus." description="A little progress today makes the bigger goal feel closer." action={{ label: "Open daily planner", href: "/planner" }}/>{storageError && <div className="planner-alert error" role="alert">{storageError}</div>}<section className="dashboard-stats"><StatCard label="Selected roadmap" value={record.answers.roadmap} detail={`${progress?.remaining ?? 0} problems remaining`} icon={Target}/><StatCard label="Weekly study target" value={`${record.answers.studyDays.length} days`} detail={`${formatMinutes(record.answers.studyDays.length * record.answers.minutesPerDay)} · ${record.answers.weeklyProblemTarget} problems`} icon={Clock3}/><StatCard label="Target difficulty" value={record.answers.difficulty} detail={`${record.answers.language} · ${record.answers.proficiency}`} icon={Flame}/><StatCard label="Estimated workload" value={formatMinutes(plan.workloadMinutes)} detail={`${Number.isFinite(plan.estimatedWeeks) ? plan.estimatedWeeks : "—"} estimated weeks · planning estimate`} icon={TrendingUp}/></section><div className="dashboard-grid"><section className="panel" style={{ padding: 21 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 18 }}><div><div style={{ fontSize: 15, fontWeight: 650 }}>Your next study day</div><div className="muted" style={{ fontSize: 11, marginTop: 5 }}>{firstDate ? new Intl.DateTimeFormat(undefined,{weekday:"long",month:"short",day:"numeric"}).format(new Date(`${firstDate}T12:00:00`)) : "No tasks scheduled"} · {record.answers.minutesPerDay} min available</div></div><span className="goal-pill">{record.answers.weeklyProblemTarget} problems / week</span></div>{nextTasks.length ? nextTasks.map((task) => <div key={task.id} className="dashboard-task"><div className="task-marker"><Check size={12}/></div><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600 }}>{task.title}</div><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{task.chapter} · {task.section} · {task.date}</div><Link href={`/roadmap#problem-${encodeURIComponent(task.problemId)}`} className="dashboard-link">Open roadmap entry <ArrowRight size={12}/></Link></div><span className="muted" style={{ fontSize: 10 }}>{task.minutes} min</span></div>) : <div className="dashboard-empty">No remaining unsolved tasks are currently scheduled. Review your roadmap or update your preferences.</div>}<Link href="/planner" className="dashboard-link">View your planner <ArrowRight size={13}/></Link></section><div style={{ display: "grid", gap: 14 }}><section className="panel" style={{ padding: 20 }}><div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 650 }}><BookOpen size={17} color="var(--green)"/>Your first weekly sprint</div><div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{record.answers.roadmap} · {goal || "DSA practice"}</div><div className="progress-track" style={{ marginTop: 18 }}><div className="progress-fill" style={{ width: `${weekly.length ? Math.round(weekly.filter((task) => task.status === "completed").length / weekly.length * 100) : 0}%` }}/></div><div className="muted" style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginTop: 8 }}><span>{progress?.solved ?? 0} problems solved</span><span>{weekly.length} sprint tasks</span></div><Link href="/calendar" className="dashboard-link">Sprint overview <ArrowRight size={13}/></Link></section><section className="panel" style={{ padding: 20 }}><div style={{ fontSize: 14, fontWeight: 650 }}>Your preparation goal</div><p className="muted" style={{ fontSize: 11, lineHeight: 1.7 }}>{goal || "Build consistent DSA interview practice"}</p><Link href="/settings" style={{ color: "var(--green)", fontSize: 11 }}>Edit preferences →</Link></section></div></div><div className="muted demo-footnote">Local demo data is stored in this browser. Estimates are planning assumptions and not a completion promise.</div></>;
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return `${hours ? `${hours}h ` : ""}${rest ? `${rest}m` : hours ? "" : "0m"}`.trim(); }
