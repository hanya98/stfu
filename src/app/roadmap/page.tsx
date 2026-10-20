import { PageTitle } from "@/components/ui";
import { RoadmapBrowser } from "@/components/roadmap-browser";

export default function Roadmap() {
  return <>
    <PageTitle eyebrow="Your learning path · imported sheet" title="A2Z DSA Roadmap" description="Browse the sections and entries from the Striver sheet you provided." action={{ label: "Plan today's session", href: "/planner" }}/>
    <RoadmapBrowser/>
  </>;
}
