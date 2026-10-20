import Link from "next/link";
import { ArrowDownRight, ArrowRight, BookOpenCheck, CalendarClock, ChartNoAxesCombined, Check, CirclePlay, Clock3, Layers3, RotateCcw, Sparkles } from "lucide-react";
import { BrandLockup } from "@/components/brand-mark";
import { brand } from "@/lib/brand";

const features = [
  { icon: Layers3, title: "A roadmap with a next step", text: "Move through topics in sequence and keep your progress where you left it." },
  { icon: CalendarClock, title: "A routine that fits", text: "Shape practice around your available days and the time you can give it." },
  { icon: RotateCcw, title: "Revision with context", text: "Bring attempted problems back into view when they need another pass." },
  { icon: ChartNoAxesCombined, title: "Progress you can trust", text: "See your recorded work clearly, without invented activity or inflated estimates." },
];

export default function Home() {
  return <div className="landing-page">
    <nav className="landing-nav" aria-label="Main navigation"><Link href="/" aria-label={`${brand.name} home`}><BrandLockup/></Link><div><Link href="/roadmap">Explore roadmap</Link><Link href="/dashboard">Open workspace <ArrowRight size={14}/></Link></div></nav>
    <section className="landing-hero">
      <div className="landing-copy"><div className="landing-kicker"><span className="status-dot"/> A focused workspace for interview preparation</div>
        <h1>Stack your prep.<br/><span>Make progress visible.</span></h1>
        <p>{brand.description} Organise the roadmap, plan a steady study rhythm, and keep revision moving—one clear next step at a time.</p>
        <div className="landing-actions"><Link className="button-primary landing-primary" href="/onboarding">Build your study plan <ArrowRight size={16}/></Link><Link className="landing-secondary" href="/dashboard"><CirclePlay size={16}/> Explore the demo</Link></div>
        <div className="landing-note"><Check size={14}/> Local demo mode · your activity stays in this browser</div>
      </div>
      <div className="landing-preview-wrap" aria-label="Illustrative preview of a study plan">
        <div className="landing-orbit landing-orbit-one"/><div className="landing-orbit landing-orbit-two"/>
        <section className="landing-preview panel"><div className="preview-top"><span><BookOpenCheck size={15}/> TODAY’S SESSION</span><span className="preview-date">EXAMPLE</span></div>
          <div className="preview-title">Build momentum, one topic at a time.</div><div className="preview-subtitle">A sample of how your personal plan could be organised.</div>
          <div className="preview-task"><span className="preview-task-icon"><Layers3 size={16}/></span><span><strong>Roadmap practice</strong><small>Pick up from your next unsolved topic</small></span><ArrowRight size={15}/></div>
          <div className="preview-task"><span className="preview-task-icon muted-icon"><RotateCcw size={16}/></span><span><strong>Review a previous attempt</strong><small>Keep revision alongside new practice</small></span><Clock3 size={15}/></div>
          <div className="preview-footer"><span><Sparkles size={14}/> Your pace, your plan</span><span><ArrowDownRight size={14}/> Start small</span></div>
        </section><span className="preview-caption">A calm place to keep your next step in focus</span>
      </div>
    </section>
    <section className="landing-features"><div className="landing-section-heading"><span className="eyebrow">PREP, WITH A LITTLE MORE STRUCTURE</span><h2>Everything has a place.<br/><span>Every session has a purpose.</span></h2></div><div className="landing-feature-grid">{features.map(({ icon: Icon, title, text }, index) => <article className="landing-feature panel" key={title}><div className="landing-feature-number">0{index + 1}</div><Icon size={19} aria-hidden="true"/><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <footer className="landing-footer"><BrandLockup compact/><span>Built for deliberate practice. {brand.tagline}</span><Link href="/onboarding">Get started <ArrowRight size={13}/></Link></footer>
  </div>;
}
