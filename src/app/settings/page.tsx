"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, LoaderCircle, Settings2 } from "lucide-react";
import { PageTitle } from "@/components/ui";
import { loadOnboardingRecord } from "@/lib/onboarding/storage";
import type { OnboardingRecord } from "@/lib/onboarding/types";

export default function Settings() {
  const [record, setRecord] = useState<OnboardingRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => { setRecord(loadOnboardingRecord()); setLoaded(true); }, 0); return () => window.clearTimeout(timer); }, []);
  return <><PageTitle eyebrow="Your preferences" title="Settings" description="Update your preparation goals and study routine at any time."/><div className="panel" style={{ maxWidth: 760, padding: 22 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Settings2 size={17} color="var(--accent)"/><strong style={{ fontSize: 14 }}>Preparation profile</strong></div><p className="muted" style={{ fontSize: 11, lineHeight: 1.7 }}>Your settings are stored in this browser only. Editing preferences keeps your profile and roadmap progress record intact.</p>{!loaded ? <div role="status" className="muted" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11 }}><LoaderCircle size={14} className="spin"/>Loading local preferences…</div> : record ? <div className="settings-summary">{[["Status", record.completed ? "Onboarding complete" : "Onboarding in progress"], ["Preparation goals", record.answers.goals.join(", ") || "Not selected"], ["Experience", record.answers.experience], ["Language", record.answers.language], ["Study target", `${record.answers.studyDays.length} days · ${record.answers.minutesPerDay} min/day`], ["Preferred times", record.answers.preferredTimes.join(", ") || "Not selected"], ["Roadmap", record.answers.roadmap], ["Selected topics", record.answers.topicSelection === "all" ? "Entire roadmap" : `${record.answers.selectedTopics.length} topics`]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div> : <div className="empty-profile"><CheckCircle2 size={18}/><div><strong>No preparation profile yet</strong><p>Complete onboarding to create your local demo plan.</p></div></div>}
      <div className="settings-edit"><div><strong>{record ? "Edit your preferences" : "Create your plan"}</strong><p className="muted">Rerun onboarding without clearing saved progress.</p></div><Link href="/onboarding" className="button-primary">{record ? "Edit preferences" : "Start onboarding"}<ArrowRight size={14}/></Link></div>
    </div><p className="muted" style={{ fontSize: 10, marginTop: 15 }}>Local demo mode · No account, cloud sync, or external integration is configured.</p></>;
}
