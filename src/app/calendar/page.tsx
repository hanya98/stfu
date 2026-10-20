"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, RotateCcw, Target, X } from "lucide-react";
import { PageTitle } from "@/components/ui";
import { generateRoadmapSchedule, localDayKey, mergeGeneratedSchedule, reconcileSolvedTasks, type PlannerRecord, type PlannerTask } from "@/lib/planner/engine";
import { loadPlannerRecord, savePlannerRecord, updatePlannerTask } from "@/lib/planner/storage";
import { addLocalDays, calculateSprintProgress, dateKey, freshSprint, loadSprints, saveSprint, sprintDailyBreakdown, suggestedSprintTargets, weekStartKey, weekdayIndex, type SprintTargets, type WeeklySprint } from "@/lib/planner/sprints";
import { loadOnboardingRecord, saveOnboardingRecord } from "@/lib/onboarding/storage";
import { getProblemProgress, loadRoadmapProgress, saveRoadmapProgress } from "@/lib/roadmap/progress";
import { loadRoadmapCatalog } from "@/lib/roadmap/catalog-storage";

type View = "month" | "week" | "agenda";
const today = () => localDayKey(new Date());
const atNoon = (key: string) => new Date(key + "T12:00:00");
const formatDate = (key: string, options: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => new Intl.DateTimeFormat(undefined, options).format(atNoon(key));
const moveMonth = (date: Date, months: number) => new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
const progressId = (task: PlannerTask) => task.problemId;
const buttonStyle = { background: "transparent", border: "1px solid var(--line)", borderRadius: 7, padding: "7px 9px", color: "var(--text)", cursor: "pointer" } as const;

export default function Calendar() {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => atNoon(today()));
  const [sprints, setSprints] = useState<WeeklySprint[]>([]);
  const [onboarding, setOnboarding] = useState<ReturnType<typeof loadOnboardingRecord>>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hiddenRecovery, setHiddenRecovery] = useState(false);
  const [editTask, setEditTask] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<SprintTargets | null>(null);
  const refresh = useCallback(() => { setTasks(loadPlannerRecord().tasks); setSprints(loadSprints()); setOnboarding(loadOnboardingRecord()); setLoaded(true); }, []);
  useEffect(() => { const timer = window.setTimeout(refresh, 0); return () => window.clearTimeout(timer); }, [refresh]);
  const selectedWeek = weekStartKey(cursor);
  const selectedSprint = sprints.find((sprint) => sprint.weekStart === selectedWeek);
  const weekTasks = useMemo(() => tasks.filter((task) => task.date >= selectedWeek && task.date < dateKey(addLocalDays(atNoon(selectedWeek), 7)) && task.status !== "rescheduled"), [tasks, selectedWeek]);
  const overdue = tasks.filter((task) => task.date < today() && task.status === "planned" && (!onboarding?.completed || onboarding.answers.studyDays.includes(weekdayIndex(task.date))));
  const targets = targetDraft ?? selectedSprint?.targets ?? suggestedSprintTargets(weekTasks, onboarding?.answers.minutesPerDay ?? 0, onboarding?.answers.studyDays ?? [], onboarding?.answers.weeklyProblemTarget ?? 0);
  const actuals = calculateSprintProgress(tasks, selectedWeek);
  const breakdown = sprintDailyBreakdown(weekTasks, selectedWeek);

  function mutatePlanner(next: PlannerRecord, success: string) {
    const result = savePlannerRecord(next);
    if (!result.ok) { setError(result.message); setNotice(""); return false; }
    setTasks(next.tasks); setError(""); setNotice(success); return true;
  }
  function markDone(task: PlannerTask) {
    const next = updatePlannerTask({ version: 1, tasks, updatedAt: "" }, task.id, task.status === "completed" ? "planned" : "completed");
    if (!mutatePlanner(next, task.status === "completed" ? "Task returned to planned." : "Task marked complete.")) return;
    if (task.status !== "completed" && task.kind !== "revision") {
      const record = loadRoadmapProgress(); const current = getProblemProgress(record, progressId(task)); const now = new Date().toISOString();
      const saved = saveRoadmapProgress({ ...record, updatedAt: now, problems: { ...record.problems, [progressId(task)]: { ...current, status: "solved", solvedAt: current.status === "solved" ? current.solvedAt ?? now : now, updatedAt: now } } });
      if (!saved.ok) setError("Task updated, but roadmap progress could not be saved: " + saved.message);
    }
  }
  function moveTask(task: PlannerTask, newDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(atNoon(newDate).getTime())) { setError("Choose a valid date."); return; }
    if (dateKey(atNoon(newDate)) !== newDate) { setError("Choose a real calendar date."); return; }
    if (onboarding?.completed && !onboarding.answers.studyDays.includes(weekdayIndex(newDate))) { setError("That date is one of your selected rest days. Choose a study day or update your availability in settings."); return; }
    if (onboarding?.answers.targetCompletionDate && newDate > onboarding.answers.targetCompletionDate) { setError("That date is after your target completion date. Extend the date in settings first."); return; }
    const duplicate = tasks.some((item) => item.id !== task.id && item.problemId === task.problemId && item.date === newDate && item.status !== "rescheduled");
    if (duplicate) { setError("This problem already has a task on that date."); return; }
    const occupied = tasks.filter((item) => item.id !== task.id && item.date === newDate && ["planned", "attempted", "completed"].includes(item.status)).reduce((sum, item) => sum + item.minutes, 0);
    if (onboarding?.completed && occupied + task.minutes > onboarding.answers.minutesPerDay) { setError("That date would exceed your available daily study time."); return; }
    const next = { version: 1 as const, updatedAt: new Date().toISOString(), tasks: tasks.map((item) => item.id === task.id ? { ...item, date: newDate, status: "planned" as const, completedAt: undefined, userRescheduled: true } : item) };
    if (mutatePlanner(next, "Task rescheduled to " + formatDate(newDate) + ".")) setEditTask(null);
  }
  function saveTargets(nextTargets: SprintTargets) {
    const result = saveSprint(freshSprint(selectedWeek, nextTargets));
    if (!result.ok) { setError(result.message); return; }
    setSprints(loadSprints()); setTargetDraft(null); setError(""); setNotice("Weekly sprint saved.");
  }
  function catchUpGradually() {
    if (!onboarding || !overdue.length) return;
    const resultTasks = [...tasks]; let moved = 0; let offset = 0;
    for (const task of [...overdue].sort((a, b) => (a.kind === "revision" ? -1 : 0) - (b.kind === "revision" ? -1 : 0) || a.date.localeCompare(b.date))) {
      let found = false;
      for (; offset < 3650; offset++) {
        const date = addLocalDays(new Date(), offset); const key = dateKey(date);
        if (!onboarding.answers.studyDays.includes(date.getDay()) || onboarding.answers.targetCompletionDate && key > onboarding.answers.targetCompletionDate) continue;
        const used = resultTasks.filter((item) => item.date === key && ["planned", "attempted", "completed"].includes(item.status)).reduce((sum, item) => sum + item.minutes, 0);
        if (used + task.minutes > onboarding.answers.minutesPerDay || resultTasks.some((item) => item.id !== task.id && item.problemId === task.problemId && item.date === key && item.status !== "rescheduled")) continue;
        const movedTask = { ...task, date: key, status: "planned" as const, completedAt: undefined, userRescheduled: true };
        resultTasks[resultTasks.findIndex((item) => item.id === task.id)] = movedTask;
        moved++; found = true; offset++; break;
      }
      if (!found) break;
    }
    if (moved) mutatePlanner({ version: 1, tasks: resultTasks, updatedAt: new Date().toISOString() }, moved + " overdue task" + (moved === 1 ? " moved" : "s moved") + " into future study slots. Other overdue work remains queued.");
    else setError("No available study slot was found. Adjust your availability or extend the target date.");
  }
  function extendDeadline() {
    if (!onboarding) return;
    const baseline = onboarding.answers.targetCompletionDate ? atNoon(onboarding.answers.targetCompletionDate) : new Date();
    const now = atNoon(today());
    if (baseline < now) baseline.setTime(now.getTime());
    baseline.setDate(baseline.getDate() + 14);
    const next = { ...onboarding, answers: { ...onboarding.answers, targetCompletionDate: dateKey(baseline) } };
    const saved = saveOnboardingRecord(next);
    if (!saved.ok) { setError(saved.message); return; }
    try {
      const current = loadPlannerRecord(); const progress = loadRoadmapProgress();
      const missedIds = new Set(current.tasks.filter((task) => task.date < today() && task.status === "planned").map((task) => task.problemId));
      const generated = generateRoadmapSchedule(next.answers, loadRoadmapCatalog(), progress, new Date(), missedIds);
      const regenerated = mergeGeneratedSchedule(reconcileSolvedTasks(current, progress), generated, today());
      const planSaved = savePlannerRecord(regenerated);
      if (!planSaved.ok) { setError("The target date was saved, but the future plan could not be regenerated: " + planSaved.message); return; }
      setOnboarding(next); setTasks(regenerated.tasks); setNotice("Target date extended by two weeks and future tasks recalculated. Overdue tasks remain queued.");
    } catch { setOnboarding(next); setError("The target date was saved, but the future plan could not be regenerated. Use Regenerate in Daily planner."); }
  }
  function reduceSprintTarget() {
    saveTargets({ ...targets, problems: actuals.problems + Math.max(0, Math.ceil((targets.problems - actuals.problems) / 2)), studyMinutes: actuals.studyMinutes + Math.max(0, Math.ceil((targets.studyMinutes - actuals.studyMinutes) / 2)) });
  }
  if (!loaded) return <div className="panel planner-state" role="status"><span className="planner-spinner"/>Loading saved calendar and sprint data…</div>;

  const days = view === "month" ? monthDays(cursor) : view === "week" ? Array.from({ length: 7 }, (_, i) => dateKey(addLocalDays(atNoon(selectedWeek), i))) : [...new Set(tasks.map((task) => task.date).filter((key) => key >= selectedWeek && key < dateKey(addLocalDays(atNoon(selectedWeek), 7))))].sort();
  const visibleDays = days.length ? days : view === "agenda" ? [selectedWeek] : days;
  const headline = view === "month" ? new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(cursor) : formatDate(selectedWeek) + " – " + formatDate(dateKey(addLocalDays(atNoon(selectedWeek), 6)));
  const nav = (direction: number) => { setTargetDraft(null); setCursor(view === "month" ? moveMonth(cursor, direction) : atNoon(dateKey(addLocalDays(cursor, direction * (view === "week" ? 7 : 1))))); };

  return <>
    <PageTitle eyebrow="YOUR WEEKLY RHYTHM · LOCAL DEMO" title="Calendar & sprints" description="Calendar events and sprint progress use the same saved planner tasks." action={{ label: "Open daily planner", href: "/planner" }}/>
      <PageTitle eyebrow="YOUR WEEKLY RHYTHM" title="Calendar & sprints" description="Calendar events and sprint progress use the same saved planner tasks." action={{ label: "Open daily planner", href: "/planner" }}/>
    {error && <div className="planner-alert error" role="alert">{error}</div>}{notice && <div className="planner-alert success" role="status">{notice}</div>}
    <section className="panel calendar-sprint">
      <div className="planner-section-heading"><div><span className="eyebrow">WEEKLY SPRINT · MON–SUN</span><h2>{formatDate(selectedWeek, { month: "short", day: "numeric" })} – {formatDate(dateKey(addLocalDays(atNoon(selectedWeek), 6)), { month: "short", day: "numeric", year: "numeric" })}</h2><p>Targets suggest your onboarding goals and scheduled work. Actuals count completed task records once.</p></div><Target size={18} color="var(--accent)"/></div>
      <div className="sprint-goal-grid">{(["problems", "studyMinutes", "revisions", "topics"] as const).map((key) => { const label = { problems: "New problems", studyMinutes: "Study minutes", revisions: "Revisions", topics: "Topics covered" }[key]; const unit = key === "studyMinutes" ? " min" : ""; return <label className="panel sprint-goal" key={key}><span>{label}</span><strong>{actuals[key]} <small>/</small> <input aria-label={label + " target"} type="number" min="0" max="100000" step="1" value={targets[key]} onChange={(event) => setTargetDraft({ ...targets, [key]: Number(event.target.value) })}/>{unit}</strong><span className="muted">{Math.max(0, targets[key] - actuals[key])}{unit} remaining · {actuals[key] ? "actual" : "no completed activity"}</span></label>; })}</div>
      <button type="button" className="button-secondary" onClick={() => saveTargets(targets)}>Save sprint targets</button>
      <div className="progress-track" aria-label="New problem sprint progress"><div className="progress-fill" style={{ width: Math.min(100, targets.problems ? actuals.problems / targets.problems * 100 : actuals.problems ? 100 : 0) + "%" }}/></div>
      <div className="sprint-daily-breakdown">{breakdown.map((day) => <div key={day.date}><span>{formatDate(day.date, { weekday: "short" })}</span><strong>{day.completed}/{day.completed + day.planned}</strong><small>{day.minutes} min complete</small></div>)}</div><p className="muted planner-footnote">Daily count = completed / completed + planned.</p>
      <p className="muted planner-footnote">Study time uses saved task estimates because the task completion flow does not yet record elapsed time. Revisions count toward revision targets, not new problem targets.</p>
    </section>
    {!hiddenRecovery && overdue.length > 0 && <section className="panel planner-recovery"><div className="planner-section-heading"><div><span className="eyebrow">OVERDUE · NEEDS YOUR INPUT</span><h2>{overdue.length} tasks · {overdue.reduce((sum, task) => sum + task.minutes, 0)} estimated minutes</h2><p>Original task records stay saved. Nothing is added to today automatically.</p></div><button type="button" aria-label="Dismiss overdue prompt" style={buttonStyle} onClick={() => setHiddenRecovery(true)}><X size={15}/></button></div><div className="planner-actions"><button type="button" className="button-primary" onClick={catchUpGradually}>Redistribute gradually</button><button type="button" className="button-secondary" onClick={reduceSprintTarget}>Reduce this sprint target</button><button type="button" className="button-secondary" onClick={extendDeadline}>Extend completion date by 2 weeks</button></div><p className="muted planner-footnote">Revisions are placed first; each task is moved onto a selected study day only when the daily time limit allows it.</p></section>}
    <section className="panel calendar-sprint" style={{ marginTop: 14 }}>
      <div className="planner-section-heading calendar-controls"><div className="calendar-switch" role="group" aria-label="Calendar view">{(["month", "week", "agenda"] as const).map((mode) => <button key={mode} type="button" aria-pressed={view === mode} style={view === mode ? { ...buttonStyle, borderColor: "var(--accent)", color: "var(--accent)" } : buttonStyle} onClick={() => { setTargetDraft(null); setView(mode); }}>{mode[0].toUpperCase() + mode.slice(1)}</button>)}</div><div className="calendar-date-navigation"><button type="button" style={buttonStyle} aria-label="Previous period" onClick={() => nav(-1)}><ChevronLeft size={16}/></button><strong>{headline}</strong><button type="button" style={buttonStyle} aria-label="Next period" onClick={() => nav(1)}><ChevronRight size={16}/></button><button type="button" style={buttonStyle} onClick={() => { setTargetDraft(null); setCursor(atNoon(today())); }}>Today</button></div></div>
      {view === "month" && <div className="calendar-weekday-labels">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>}
      {visibleDays.length ? <div className={view === "month" ? "calendar-month-grid" : view === "week" ? "calendar-week" : "calendar-agenda"}>{visibleDays.map((key) => {
        const dayTasks = tasks.filter((task) => task.date === key && task.status !== "rescheduled");
        const rest = onboarding?.completed && !onboarding.answers.studyDays.includes(weekdayIndex(key));
        return <article key={key} className={"calendar-day" + (key === today() ? " today" : "") + (view === "month" ? " month-day" : "")}>
          <div className="calendar-day-head"><span>{view === "month" ? formatDate(key, { weekday: "short" }) : formatDate(key, { weekday: "long" })}</span><time>{view === "month" ? atNoon(key).getDate() : formatDate(key, { month: "short", day: "numeric" })}</time></div>
          {rest && <span className="calendar-rest">Rest day</span>}
          {dayTasks.length ? dayTasks.map((task) => <div className={"calendar-task " + task.status + " " + task.kind} key={task.id}><span>{task.status === "completed" ? <Check size={11}/> : <Clock3 size={11}/>}</span><Link title={task.title} href={"/roadmap#problem-" + encodeURIComponent(task.problemId)}>{task.title}</Link><small>{task.kind === "revision" ? "Revision" : "Practice"} · {task.minutes}m · {task.status === "completed" ? "Done" : task.status === "planned" && task.date < today() ? "Overdue" : task.status}</small><div className="calendar-item-actions">{task.status !== "completed" && <button type="button" onClick={() => markDone(task)} aria-label={"Complete " + task.title}>Done</button>}{task.status !== "completed" && <button type="button" onClick={() => setEditTask(editTask === task.id ? null : task.id)} aria-label={"Reschedule " + task.title}>Move</button>}</div>{editTask === task.id && <label className="calendar-move">New date<input type="date" min={today()} defaultValue={task.date} onChange={(event) => event.target.value && moveTask(task, event.target.value)}/></label>}</div>) : !rest && view !== "month" && <span className="calendar-rest">No tasks scheduled</span>}
        </article>;
      })}</div> : <div className="planner-empty-inline"><CalendarDays size={17} color="var(--accent)"/><div><strong>No tasks in this view</strong><p>Generate roadmap tasks in Daily planner and they will appear here.</p></div></div>}
      <p className="muted planner-footnote">All dates use your device’s local calendar. Completed and overdue task records remain in their historical dates. Rescheduled tasks update their existing record.</p>
    </section>
    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}><Link className="button-secondary" href="/planner"><ArrowLeft size={14}/> Daily planner</Link><Link className="button-secondary" href="/revision"><RotateCcw size={14}/> Revision tracker</Link><span className="muted demo-footnote">Saved locally on this device · no account sync configured</span></div>
    <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}><Link className="button-secondary" href="/planner"><ArrowLeft size={14}/> Daily planner</Link><Link className="button-secondary" href="/revision"><RotateCcw size={14}/> Revision tracker</Link></div>
  </>;
}

function monthDays(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12); const offset = (first.getDay() + 6) % 7;
  const start = addLocalDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => dateKey(addLocalDays(start, index)));
}
