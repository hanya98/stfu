"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, CheckSquare, ChevronLeft, ChevronRight, CircleHelp, Flame, LayoutDashboard, ListChecks, Menu, RotateCcw, Settings2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { loadPlannerRecord } from "@/lib/planner/storage";
import { loadOnboardingRecord } from "@/lib/onboarding/storage";
import { dismissStorageRecoveryNotice, getStorageRecoveryNotice } from "@/lib/persistence/recovery";
import { BrandLockup } from "@/components/brand-mark";
import { brand } from "@/lib/brand";

const nav = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "A2Z Roadmap", href: "/roadmap", icon: ListChecks },
  { label: "Daily planner", href: "/planner", icon: CheckSquare },
  { label: "Revision tracker", href: "/revision", icon: RotateCcw },
  { label: "Calendar & sprints", href: "/calendar", icon: CalendarDays },
  { label: "Analytics", href: "/analytics", icon: Activity },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [weeklyFocus, setWeeklyFocus] = useState({ completed: 0, target: 0 });
  const [storageIssues, setStorageIssues] = useState<string[]>([]);
  useEffect(() => { const timer = window.setTimeout(() => { const plan = loadPlannerRecord(); const answers = loadOnboardingRecord()?.answers; const monday = new Date(); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); const start = `${monday.getFullYear()}-${String(monday.getMonth()+1).padStart(2,"0")}-${String(monday.getDate()).padStart(2,"0")}`; const doneDays = new Set(plan.tasks.filter((task) => task.status === "completed" && task.date >= start).map((task) => task.date)); setWeeklyFocus({ completed: doneDays.size, target: answers?.studyDays.length ?? 0 }); setStorageIssues(getStorageRecoveryNotice()); }, 50); return () => window.clearTimeout(timer); }, [pathname]);
  const active = nav.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const sidebar = <aside className="desktop-sidebar" style={{ width: 248, flexShrink: 0, borderRight: "1px solid var(--line)", minHeight: "100vh", padding: "26px 16px", display: "flex", flexDirection: "column", background: "#0e110f" }}>
    <Link href="/" aria-label={`${brand.name} home`} style={{ display: "flex", gap: 10, alignItems: "center", padding: "0 8px 30px", fontWeight: 700, fontSize: 19 }}><BrandLockup/></Link>
    <div className="eyebrow" style={{ padding: "0 10px 10px" }}>Workspace</div>
    <nav style={{ display: "grid", gap: 4 }}>{nav.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active?.href === href ? "page" : undefined} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 11px", borderRadius: 9, fontSize: 13, color: active?.href === href ? "#e8ddff" : "#a1a1b5", background: active?.href === href ? "#241b3a" : "transparent" }}><Icon size={17} color={active?.href === href ? "var(--accent)" : "currentColor"}/>{label}</Link>)}</nav>
    <div style={{ marginTop: 30, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--panel)" }}><div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, fontWeight: 600 }}><Flame size={15} color="var(--accent)"/>Your weekly focus</div><p className="muted" style={{ fontSize: 11, lineHeight: 1.6, marginBottom: 12 }}>A study day counts after you complete at least one planned task.</p><div className="progress-track"><div className="progress-fill" style={{ width: `${weeklyFocus.target ? Math.min(100,weeklyFocus.completed/weeklyFocus.target*100) : 0}%` }}/></div><div className="muted" style={{ fontSize: 10, marginTop: 7 }}>{weeklyFocus.completed} of {weeklyFocus.target || "—"} selected study days completed</div></div>
    <div style={{ marginTop: "auto", display: "grid", gap: 3, paddingTop: 24 }}><Link href="/settings" style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 11px", fontSize: 13, color: "#9ca59f" }}><Settings2 size={17}/>Settings</Link><div style={{ borderTop: "1px solid var(--line)", margin: "10px 0 13px" }}/><div style={{ display: "flex", gap: 10, alignItems: "center", padding: "5px 7px" }}><div style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: "#241b3a", color: "var(--accent-strong)", fontSize: 12, fontWeight: 700 }}>S</div><div><div style={{ fontSize: 12, fontWeight: 600 }}>Local demo account</div><div className="muted" style={{ fontSize: 10 }}>Saved on this device</div></div><ChevronLeft size={14} style={{ marginLeft: "auto" }} className="muted"/></div></div>
  </aside>;
  if (pathname === "/") return <>{children}</>;
  return <div style={{ display: "flex", minHeight: "100vh" }}>{sidebar}<div style={{ minWidth: 0, flex: 1 }}><header style={{ height: 62, borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px" }}><div className="muted" style={{ fontSize: 12 }}>Workspace <ChevronRight size={13} style={{ verticalAlign: "middle", margin: "0 5px" }}/> <span style={{ color: "#e4e9e5" }}>{active?.label ?? (pathname === "/" ? "Welcome" : "Onboarding")}</span></div><div style={{ display: "flex", alignItems: "center", gap: 14 }}><span className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, background: "var(--accent)", borderRadius: 10 }}/>Local demo</span><Link href="/settings" aria-label="Help and settings" className="muted"><CircleHelp size={17}/></Link><button onClick={() => setOpen(!open)} className="mobile-nav" aria-expanded={open} aria-controls="mobile-workspace-navigation" aria-label={open ? "Close navigation" : "Open navigation"} style={{ display: "none", background: "transparent", color: "white", border: 0 }}>{open ? <X size={19}/> : <Menu size={19}/>}</button></div></header>{open && <nav id="mobile-workspace-navigation" aria-label="Mobile workspace" style={{ padding: 12, borderBottom: "1px solid var(--line)" }}>{nav.map(({ label, href, icon: Icon }) => <Link key={href} href={href} onClick={() => setOpen(false)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: 8, fontSize: 12 }}><Icon size={15}/>{label}</Link>)}</nav>}{storageIssues.length > 0 && <div className="storage-recovery-banner" role="alert"><div><strong>Saved data needs recovery</strong><span>Some saved {brand.name} data could not be read. A local backup was made before continuing with safe defaults. The original data has not been deleted.</span></div><button type="button" onClick={() => { dismissStorageRecoveryNotice(); setStorageIssues([]); }}>Dismiss</button></div>}<main style={{ maxWidth: 1440, margin: "0 auto", padding: "34px 36px 60px" }}>{children}</main></div></div>;
}
