import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { brand } from "@/lib/brand";

export default function NotFound() {
  return <section className="panel launch-state" aria-labelledby="not-found-title">
    <SearchX size={22} color="var(--accent)" aria-hidden="true"/>
    <span className="eyebrow">404 · PAGE NOT FOUND</span>
    <h1 id="not-found-title">This page isn’t on your roadmap.</h1>
    <p className="muted">The link may be outdated, or the page may have moved. Your saved progress remains in this browser.</p>
    <Link className="button-primary" href="/dashboard"><ArrowLeft size={14}/> Return to {brand.name}</Link>
  </section>;
}
