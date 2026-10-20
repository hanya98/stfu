"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, ChevronRight, Clock3, ExternalLink, FileUp, Goal, ListChecks, LoaderCircle, Save, Sparkles, Target } from "lucide-react";
import { generateRoadmapSchedule, localDayKey, mergeGeneratedSchedule } from "@/lib/planner/engine";
import { loadPlannerRecord, savePlannerRecord } from "@/lib/planner/storage";
import { loadRoadmapCatalog } from "@/lib/roadmap/catalog-storage";
import { loadRoadmapProgress } from "@/lib/roadmap/progress";
import { loadOnboardingRecord, saveOnboardingRecord } from "@/lib/onboarding/storage";
import { DEFAULT_ANSWERS, DIFFICULTIES, EXPERIENCE_LEVELS, LANGUAGES, PREPARATION_GOALS, ROADMAP_TYPES, STUDY_TIMES, STUDY_TOPICS, type OnboardingAnswers } from "@/lib/onboarding/types";
import { validateImportedTopics, validateStep } from "@/lib/onboarding/validation";

const STEPS = ["Welcome", "Your goals", "Your level", "Availability", "Roadmap", "Plan preview", "Ready"];
const WEEKDAYS = [{ label: "Sun", value: 0 }, { label: "Mon", value: 1 }, { label: "Tue", value: 2 }, { label: "Wed", value: 3 }, { label: "Thu", value: 4 }, { label: "Fri", value: 5 }, { label: "Sat", value: 6 }];
const fieldStyle: React.CSSProperties = { display: "grid", gap: 8, color: "#b4beb7", fontSize: 12 };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--line)", background: "#0c100d", color: "var(--text)", padding: "11px 12px", borderRadius: 9, fontSize: 12 };

export default function OnboardingPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(DEFAULT_ANSWERS);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Your progress is saved automatically on this device.");
  const [importText, setImportText] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [finishing, setFinishing] = useState(false);
  const plan = useMemo(() => {
    const generated = generateRoadmapSchedule(answers, loadRoadmapCatalog(), loadRoadmapProgress());
    const end = new Date(); end.setDate(end.getDate() + 6);
    const firstWeek = generated.tasks.filter((task) => task.date <= `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,"0")}-${String(end.getDate()).padStart(2,"0")}`);
    const weeklySprint = answers.studyDays.slice().sort((a,b)=>a-b).map((dayIndex) => {
      const dayLabel = WEEKDAYS.find((day) => day.value === dayIndex)?.label ?? "Study";
      const dayTasks = firstWeek.filter((task) => new Date(`${task.date}T12:00:00`).getDay() === dayIndex);
      return { dayIndex, dayLabel, topics: dayTasks.map((task) => task.title), minutes: dayTasks.reduce((sum,task) => sum + task.minutes,0), problemTarget: dayTasks.length };
    });
    return { estimatedWorkloadMinutes: generated.workloadMinutes, availableMinutesUntilDeadline: generated.availableMinutesUntilDeadline, estimatedWeeks: generated.estimatedWeeks, feasibleByDeadline: generated.feasibleByDeadline, weeklyCapacityMinutes: generated.weeklyCapacityMinutes, weeklySprint, problemCount: generated.tasks.length, assumptions: generated.assumptions };
  }, [answers]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const record = loadOnboardingRecord();
      if (record) { setAnswers(record.answers); setStep(record.completed ? 1 : record.currentStep); }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const prior = loadOnboardingRecord();
    const result = saveOnboardingRecord({ version: 1, answers, currentStep: step, completed: prior?.completed ?? false, updatedAt: new Date().toISOString() });
    if (!result.ok) {
      const timer = window.setTimeout(() => setStatus(result.message), 0);
      return () => window.clearTimeout(timer);
    }
  }, [answers, ready, step]);

  const set = <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => setAnswers((old) => ({ ...old, [key]: value }));
  const toggleArray = (key: "goals" | "studiedTopics" | "studyDays" | "preferredTimes" | "selectedTopics", value: string | number) => {
    const current = answers[key] as Array<string | number>;
    set(key, (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]) as never);
  };
  const goNext = () => {
    const validation = validateStep(step, answers);
    if (!validation.valid) { setError(validation.message ?? "Please check your answer."); return; }
    setError(""); setStep((current) => Math.min(current + 1, 6));
  };
  const goBack = () => { setError(""); setStep((current) => Math.max(0, current - 1)); };
  const saveAndResume = () => {
    const result = saveOnboardingRecord({ version: 1, answers, currentStep: step, completed: loadOnboardingRecord()?.completed ?? false, updatedAt: new Date().toISOString() });
    setStatus(result.ok ? "Your progress is saved on this device." : result.message);
  };
  const finish = () => {
    const validation = validateStep(1, answers);
    if (!validation.valid) { setStep(1); setError(validation.message ?? "Choose a goal to continue."); return; }
    setFinishing(true);
    const result = saveOnboardingRecord({ version: 1, answers, currentStep: 6, completed: true, updatedAt: new Date().toISOString() });
    if (!result.ok) { setFinishing(false); setError(result.message); return; }
    const existingPlanner = loadPlannerRecord();
    const today = localDayKey(new Date());
    const missedIds = new Set(existingPlanner.tasks.filter((task) => task.date < today && task.status === "planned").map((task) => task.problemId));
    const generated = generateRoadmapSchedule(answers, loadRoadmapCatalog(), loadRoadmapProgress(), new Date(), missedIds);
    const planner = mergeGeneratedSchedule(existingPlanner, generated, today);
    const plannerSave = savePlannerRecord(planner);
    if (!plannerSave.ok) { setFinishing(false); setError(`Your preferences were saved, but the study plan could not be saved: ${plannerSave.message}`); return; }
    router.push("/dashboard");
  };
  const importMetadata = () => {
    try {
      const parsed: unknown = JSON.parse(importText);
      const result = validateImportedTopics(parsed);
      if (!result.valid) { setImportMessage(result.message); return; }
      set("importedTopics", result.topics);
      setImportMessage(`${result.topics.length} topic${result.topics.length === 1 ? "" : "s"} imported and saved to your plan.`);
    } catch { setImportMessage("That is not valid JSON. Paste a JSON array of topic metadata and try again."); }
  };

  if (!ready) return <div className="panel" role="status" style={{ maxWidth: 720, margin: "40px auto", padding: 28, display: "flex", alignItems: "center", gap: 10 }}><LoaderCircle size={17} className="spin"/>Loading your saved plan…</div>;

  return <div className="onboarding-wrap">
    <div className="onboarding-top"><div><div className="eyebrow">PERSONALISED DSA PREPARATION</div><h1 className="onboarding-title">Build a plan that fits your life.</h1><p className="muted onboarding-subtitle">Planly helps you organise your roadmap, daily practice, revision, and progress in one focused space.</p></div><div className="local-pill"><span/>Local demo mode</div></div>
    <div className="step-head"><span className="step-count">STEP {step + 1} <span className="muted">/ {STEPS.length}</span></span><span className="step-name">{STEPS[step]}</span></div>
    <div className="onboarding-progress" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={step + 1}><div style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}/></div>
    <div className="step-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>{STEPS.map((name, index) => <span key={name} title={name} className={index < step ? "complete" : index === step ? "current" : ""}/>)}</div>
    <section className="panel onboarding-card" aria-labelledby="step-title">
      {step === 0 && <div className="welcome-content"><div className="welcome-icon"><Target size={24}/></div><div className="eyebrow">A STEADIER WAY TO GET THERE</div><h2 id="step-title" className="step-title">Your DSA prep, with a little more direction.</h2><p className="muted step-copy">A strong interview foundation takes time. Planly turns the work into smaller, manageable sessions, so you always know what to focus on next.</p><div className="welcome-features">{[[ListChecks,"Organise your roadmap","Keep core topics and outside problem links together."],[Clock3,"Plan daily practice","Build study sessions around the time you actually have."],[CheckCircle2,"Revise and track","Stay on top of review and see your own progress." ]].map(([Icon,title,copy]) => { const FeatureIcon = Icon as typeof Target; return <div className="welcome-feature" key={title as string}><span><FeatureIcon size={18}/></span><div><strong>{title as string}</strong><p className="muted">{copy as string}</p></div></div>; })}</div><div className="welcome-note"><Sparkles size={15}/> Your plan is saved in this browser. No account or sensitive information is needed.</div></div>}

      {step === 1 && <><div className="eyebrow">THE OPPORTUNITY AHEAD</div><h2 id="step-title" className="step-title">What are you preparing for?</h2><p className="muted step-copy">Choose every goal that fits. We’ll use it to shape your plan.</p><div className="choice-grid">{PREPARATION_GOALS.map((goal) => <button key={goal} type="button" className={`choice-card ${answers.goals.includes(goal) ? "selected" : ""}`} aria-pressed={answers.goals.includes(goal)} onClick={() => toggleArray("goals", goal)}><span className="choice-check">{answers.goals.includes(goal) && <Check size={14}/>}</span><span>{goal}</span></button>)}</div>{answers.goals.includes("Custom goal") && <label style={fieldStyle}>Describe your custom goal<input style={inputStyle} maxLength={120} value={answers.customGoal} onChange={(e) => set("customGoal", e.target.value)} placeholder="e.g. Prepare for a specific technical interview"/></label>}</>}

    {step === 2 && <><div className="eyebrow">START WHERE YOU ARE</div><h2 id="step-title" className="step-title">Tell us about your DSA experience.</h2><p className="muted step-copy">We’ll use this context to set a sensible starting pace.</p><div className="form-grid"><label style={fieldStyle}>Experience level<select style={inputStyle} value={answers.experience} onChange={(e) => set("experience", e.target.value)}>{EXPERIENCE_LEVELS.map((value) => <option key={value}>{value}</option>)}</select></label><label style={fieldStyle}>Programming language<select style={inputStyle} value={answers.language} onChange={(e) => set("language", e.target.value)}>{LANGUAGES.map((value) => <option key={value}>{value}</option>)}</select></label></div><label style={{ ...fieldStyle, marginTop: 19 }}>Current DSA proficiency<select style={inputStyle} value={answers.proficiency} onChange={(e) => set("proficiency", e.target.value)}>{["Just starting", "Basic patterns", "Comfortable with common topics", "Advanced problem solving"].map((value) => <option key={value}>{value}</option>)}</select></label><fieldset className="check-fieldset"><legend>Topics you’ve studied so far <span className="muted">(optional)</span></legend><div className="topic-chip-grid">{STUDY_TOPICS.map((topic) => <button type="button" key={topic} aria-pressed={answers.studiedTopics.includes(topic)} className={`topic-chip ${answers.studiedTopics.includes(topic) ? "selected" : ""}`} onClick={() => toggleArray("studiedTopics", topic)}>{topic}</button>)}</div><button type="button" className="inline-skip" onClick={() => set("studiedTopics", [])}>Clear and skip topics studied</button></fieldset><fieldset className="check-fieldset"><legend>Preferred problem difficulty</legend><div className="choice-grid choice-grid-small">{DIFFICULTIES.map((value) => <button type="button" key={value} aria-pressed={answers.difficulty === value} className={`choice-card ${answers.difficulty === value ? "selected" : ""}`} onClick={() => set("difficulty", value)}><span className="choice-check">{answers.difficulty === value && <Check size={14}/>}</span><span>{value}</span></button>)}</div></fieldset></>}

      {step === 3 && <><div className="eyebrow">MAKE THE TIME COUNT</div><h2 id="step-title" className="step-title">What does a realistic week look like?</h2><p className="muted step-copy">Steady, repeatable sessions make more progress than an overpacked plan.</p><div className="form-grid"><label style={fieldStyle}>Study minutes per day<input style={inputStyle} type="number" min={15} max={480} step={5} value={answers.minutesPerDay} onChange={(e) => set("minutesPerDay", Number(e.target.value))}/><span className="helper-text">Choose between 15 and 480 minutes.</span></label><label style={fieldStyle}>Weekly problem target<input style={inputStyle} type="number" min={1} max={200} value={answers.weeklyProblemTarget} onChange={(e) => set("weeklyProblemTarget", Number(e.target.value))}/><span className="helper-text">A starting target, adjustable later.</span></label></div><fieldset className="check-fieldset"><legend>Days available to study</legend><div className="day-selector">{WEEKDAYS.map(({label,value}) => <button type="button" key={value} aria-pressed={answers.studyDays.includes(value)} className={answers.studyDays.includes(value) ? "day-button selected" : "day-button"} onClick={() => toggleArray("studyDays", value)}>{label}</button>)}</div></fieldset><fieldset className="check-fieldset"><legend>Preferred study time</legend><div className="topic-chip-grid">{STUDY_TIMES.map((time) => <button type="button" key={time} aria-pressed={answers.preferredTimes.includes(time)} className={`topic-chip ${answers.preferredTimes.includes(time) ? "selected" : ""}`} onClick={() => toggleArray("preferredTimes", time)}>{time}</button>)}</div></fieldset><label style={{ ...fieldStyle, marginTop: 19 }}>Target completion date <span className="helper-text">Optional · no date is promised if the available time is not enough.</span><input style={inputStyle} type="date" min={new Date().toLocaleDateString("en-CA")} max={new Date(new Date().setFullYear(new Date().getFullYear() + 5)).toLocaleDateString("en-CA")} value={answers.targetCompletionDate} onChange={(e) => set("targetCompletionDate", e.target.value)}/></label></>}

      {step === 4 && <><div className="eyebrow">YOUR LEARNING PATH</div><h2 id="step-title" className="step-title">Choose a roadmap to work from.</h2><p className="muted step-copy">Planly stores topic metadata and links. It does not copy protected problem descriptions.</p><div className="roadmap-select">{ROADMAP_TYPES.map((roadmap) => <button type="button" key={roadmap} aria-pressed={answers.roadmap === roadmap} className={`roadmap-option ${answers.roadmap === roadmap ? "selected" : ""}`} onClick={() => set("roadmap", roadmap)}><span className="choice-check">{answers.roadmap === roadmap && <Check size={14}/>}</span><span><strong>{roadmap}</strong><small>{roadmap === "Custom roadmap" ? "Bring your own topics and links." : roadmap === "Demo roadmap" ? "Use a clearly labelled sample topic set." : "Plan from a topic outline; add your own official links."}</small></span></button>)}</div><fieldset className="check-fieldset"><legend>Topics to include</legend><div className="segmented"><button type="button" className={answers.topicSelection === "all" ? "active" : ""} aria-pressed={answers.topicSelection === "all"} onClick={() => set("topicSelection", "all")}>Entire roadmap</button><button type="button" className={answers.topicSelection === "selected" ? "active" : ""} aria-pressed={answers.topicSelection === "selected"} onClick={() => set("topicSelection", "selected")}>Selected topics</button></div>{answers.topicSelection === "selected" && <div className="topic-chip-grid topic-select-list">{STUDY_TOPICS.map((topic) => <button type="button" key={topic} aria-pressed={answers.selectedTopics.includes(topic)} className={`topic-chip ${answers.selectedTopics.includes(topic) ? "selected" : ""}`} onClick={() => toggleArray("selectedTopics", topic)}>{answers.selectedTopics.includes(topic) ? "✓ " : "+ "}{topic}</button>)}</div>}</fieldset><details className="import-panel"><summary><span><FileUp size={16}/> Import topic metadata or official problem links</span><ChevronRight size={15}/></summary><p className="muted">Paste JSON metadata you have permission to use. Planly validates links and saves titles, URLs, and estimated durations only.</p><label style={fieldStyle}>JSON array<textarea rows={6} style={{ ...inputStyle, resize: "vertical", fontFamily: "monospace", fontSize: 11 }} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'[{"name":"My topic","estimatedMinutes":120,"difficulty":"medium","links":[{"title":"Official problem","url":"https://example.com/problem"}]}]'}/></label><button type="button" className="small-action" onClick={importMetadata}><FileUp size={14}/> Validate and import</button>{importMessage && <p role="status" className="helper-text">{importMessage}</p>}{answers.importedTopics.length > 0 && <div className="imported-list">{answers.importedTopics.map((topic) => <div key={topic.name}><strong>{topic.name}</strong><span>{topic.estimatedMinutes} min estimate · {topic.links?.length ?? 0} links</span>{topic.links?.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.title}<ExternalLink size={12}/></a>)}</div>)}</div>}</details></>}

      {step === 5 && <><div className="eyebrow">A FIRST LOOK AT YOUR ROUTINE</div><h2 id="step-title" className="step-title">Here’s a first sprint to get you moving.</h2><p className="muted step-copy">This is a proposal based on your selections. Adjust your daily time or go back to change the roadmap before confirming.</p><div className="plan-summary-grid"><div><span>Estimated workload</span><strong>{formatMinutes(plan.estimatedWorkloadMinutes)}</strong></div><div><span>Your weekly capacity</span><strong>{formatMinutes(plan.weeklyCapacityMinutes)}</strong></div><div><span>Estimated duration</span><strong>{Number.isFinite(plan.estimatedWeeks) ? `${plan.estimatedWeeks} weeks` : "Unavailable"}</strong></div><div><span>Problems in plan</span><strong>{plan.problemCount}</strong></div></div>{plan.feasibleByDeadline === false && <div className="feasibility warning"><Goal size={17}/><div><strong>This deadline may be too tight.</strong><p>Your estimated workload is {formatMinutes(plan.estimatedWorkloadMinutes)}, while your availability before the target date is about {formatMinutes(plan.availableMinutesUntilDeadline ?? 0)}. Consider extending the date or increasing study time. We won’t promise completion.</p></div></div>}{plan.feasibleByDeadline === true && <div className="feasibility"><CheckCircle2 size={17}/><div><strong>Your current schedule has room before the target date.</strong><p>This is an estimate based on the topic durations and weekly capacity shown above.</p></div></div>}{plan.feasibleByDeadline === null && <div className="feasibility"><CalendarDays size={17}/><div><strong>No completion date set.</strong><p>We’ll focus on a sustainable weekly sprint and avoid estimating a finish date.</p></div></div>}<label style={{ ...fieldStyle, marginTop: 17 }}>Tune your daily study time: {answers.minutesPerDay} minutes<input type="range" min={15} max={240} step={15} value={answers.minutesPerDay} onChange={(e) => set("minutesPerDay", Number(e.target.value))} aria-label="Adjust daily study minutes"/><span className="helper-text">Changing this updates workload capacity and the sprint preview.</span></label><div className="sprint-head"><strong><CalendarDays size={16}/> Proposed first week</strong><span className="muted">{answers.weeklyProblemTarget} problems / week goal</span></div><div className="sprint-list">{plan.weeklySprint.map((session) => <div className="sprint-row" key={session.dayIndex}><span className="sprint-day">{session.dayLabel}</span><div className="sprint-topics">{session.topics.length ? session.topics.map((topic) => <span key={topic}>{topic}</span>) : <span className="muted">No roadmap tasks</span>}</div><span className="sprint-duration">{session.minutes}m · {session.problemTarget} problems</span></div>)}</div><details className="assumptions"><summary>How this estimate is made</summary><ul>{plan.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul><p>Imported or personal problem estimates take priority. Missing times use clearly labelled local planning assumptions; no Striver duration is implied.</p></details></>}

      {step === 6 && <div className="ready-state"><div className="ready-mark"><Check size={28}/></div><div className="eyebrow">PLAN READY</div><h2 id="step-title" className="step-title">You’ve got a place to start.</h2><p className="muted step-copy">Your preferences and first sprint are saved in local demo mode. Finish to open your dashboard.</p><div className="ready-summary"><div><span>Goal</span><strong>{answers.goals.join(", ") || "DSA preparation"}</strong></div><div><span>Roadmap</span><strong>{answers.roadmap}</strong></div><div><span>Weekly study target</span><strong>{answers.studyDays.length} days · {formatMinutes(plan.weeklyCapacityMinutes)}</strong></div><div><span>First sprint</span><strong>{plan.weeklySprint.length} study sessions planned</strong></div></div></div>}

      {error && <div role="alert" className="form-error">{error}</div>}
    </section>
    <div className="onboarding-actions"><div className="action-left">{step > 0 && step < 6 && <button type="button" className="button-quiet" onClick={goBack}><ArrowLeft size={15}/> Back</button>}{step === 0 && <button type="button" className="button-quiet" onClick={() => setStep(1)}>Skip welcome <ArrowRight size={14}/></button>}</div><div className="action-right">{step < 6 && <button type="button" className="button-quiet save-button" onClick={saveAndResume}><Save size={14}/> Save & resume</button>}{step < 5 && <button type="button" className="button-primary" onClick={goNext}>Continue <ArrowRight size={15}/></button>}{step === 5 && <button type="button" className="button-primary" onClick={() => { setError(""); setStep(6); }}>Confirm plan <ArrowRight size={15}/></button>}{step === 6 && <button type="button" disabled={finishing} className="button-primary" onClick={finish}>{finishing ? <LoaderCircle size={15} className="spin"/> : <Check size={15}/>} Finish & open dashboard</button>}</div></div>
    <div className="onboarding-foot"><span className="muted" role="status" aria-live="polite">{status}</span><span className="muted">Local demo account · Saved on this device only</span></div>
  </div>;
}

function formatMinutes(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return `${hours ? `${hours}h ` : ""}${rest ? `${rest}m` : hours ? "" : "0m"}`.trim(); }
