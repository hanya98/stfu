"use client";

import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="panel launch-state" role="alert" aria-labelledby="error-title">
    <TriangleAlert size={22} color="#e5b276" aria-hidden="true"/>
    <span className="eyebrow">SOMETHING WENT WRONG</span>
    <h1 id="error-title">Planly couldn’t load this page.</h1>
    <p className="muted">Your browser-saved progress has not been cleared. Try again, or return to your dashboard.</p>
    <div className="launch-actions"><button type="button" className="button-secondary" onClick={() => reset()}>Try again</button><Link className="button-primary" href="/dashboard">Go to dashboard <ArrowRight size={14}/></Link></div>
  </section>;
}
