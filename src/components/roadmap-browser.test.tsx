import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { RoadmapBrowser } from "./roadmap-browser";
import { loadRoadmapProgress } from "@/lib/roadmap/progress";
import { ROADMAP_CATALOG_KEY } from "@/lib/roadmap/catalog-storage";

const sourceText = readFileSync(resolve(process.cwd(), "src/data/source/striver-sheet.txt"), "utf8");

describe("imported roadmap browser", () => {
  beforeEach(() => window.localStorage.clear());

  it("shows imported chapters and searches problem names from the sheet", async () => {
    render(<RoadmapBrowser/>);
    expect(await screen.findByText("Imported from your Striver sheet")).toBeTruthy();
    expect(screen.getAllByText("Arrays").length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole("textbox", { name: "Search roadmap entries" }), { target: { value: "Two Sum" } });
    expect(await screen.findByText("Two Sum")).toBeTruthy();
    expect(screen.queryByText("Breaking The Myth")).toBeNull();
  });

  it("shows an empty search state and can restore the original sheet order", async () => {
    render(<RoadmapBrowser/>);
    const search = await screen.findByRole("textbox", { name: "Search roadmap entries" });
    fireEvent.change(search, { target: { value: "not on this sheet" } });
    expect(screen.getByRole("status").textContent).toContain("No problems match");
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByText("Beginner Problems").length).toBeGreaterThan(0);
  });

  it("saves status, notes, time, links and attempts, then restores status after a refresh", async () => {
    const first = render(<RoadmapBrowser/>);
    await screen.findByText("Imported from your Striver sheet");
    fireEvent.change(screen.getByRole("textbox", { name: "Search roadmap entries" }), { target: { value: "Breaking The Myth" } });
    await screen.findByText("Breaking The Myth");
    fireEvent.click(screen.getByRole("checkbox", { name: "Done: Breaking The Myth" }));
    await waitFor(() => expect(first.container.querySelector(".roadmap-progress-heading strong")?.textContent).toContain("1 / 495 solved"));
    const saved = Object.values(loadRoadmapProgress().problems)[0];
    expect(saved.status).toBe("solved");

    first.unmount();
    const refreshed = render(<RoadmapBrowser/>);
    fireEvent.change(await screen.findByRole("textbox", { name: "Search roadmap entries" }), { target: { value: "Breaking The Myth" } });
    const status = await screen.findByRole("checkbox", { name: "Done: Breaking The Myth" });
    expect(status).toBeChecked();
    expect(refreshed.container.querySelector(".roadmap-progress-heading strong")?.textContent).toContain("1 / 495 solved");
  });

  it("bulk marks every problem in a topic done and exposes a mixed completion state", async () => {
    render(<RoadmapBrowser/>);
    await screen.findByText("Imported from your Striver sheet");
    const search = screen.getByRole("textbox", { name: "Search roadmap entries" });
    fireEvent.change(search, { target: { value: "Breaking The Myth" } });
    fireEvent.click(await screen.findByRole("checkbox", { name: "Done: Breaking The Myth" }));
    fireEvent.change(search, { target: { value: "" } });
    const topicDone = await screen.findByRole("checkbox", { name: "Mark all problems in Fundamentals of Programming done" });
    expect((topicDone as HTMLInputElement).indeterminate).toBe(true);
    fireEvent.click(topicDone);
    await waitFor(() => {
      const saved = Object.values(loadRoadmapProgress().problems);
      expect(saved.filter((item) => item.status === "solved")).toHaveLength(7);
    });
    expect(topicDone).toBeChecked();
    fireEvent.click(topicDone);
    await waitFor(() => expect(Object.values(loadRoadmapProgress().problems).filter((item) => item.status === "solved")).toHaveLength(0));
  });

  it("rejects malformed problem links and records attempts with valid details", async () => {
    render(<RoadmapBrowser/>);
    await screen.findByText("Imported from your Striver sheet");
    fireEvent.change(screen.getByRole("textbox", { name: "Search roadmap entries" }), { target: { value: "Breaking The Myth" } });
    await screen.findByText("Breaking The Myth");
    fireEvent.click(screen.getByText("Details"));
    fireEvent.change(screen.getByLabelText("Problem URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.change(screen.getByLabelText("Custom estimate (minutes)"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Review the basic examples" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("http or https");
    expect(Object.values(loadRoadmapProgress().problems)).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Problem URL"), { target: { value: "https://example.org/problem" } });
    fireEvent.click(screen.getByRole("button", { name: "Save details" }));
    await waitFor(() => expect(Object.values(loadRoadmapProgress().problems)[0]?.url).toBe("https://example.org/problem"));
    expect(Object.values(loadRoadmapProgress().problems)[0]?.estimatedMinutes).toBe(40);
    expect(Object.values(loadRoadmapProgress().problems)[0]?.notes).toBe("Review the basic examples");
    fireEvent.click(screen.getByText("Details"));
    expect(screen.getByRole("link", { name: "Open problem link" })).toHaveAttribute("href", "https://example.org/problem");
    fireEvent.change(screen.getByLabelText("Attempt time (minutes)"), { target: { value: "25" } });
    fireEvent.click(screen.getByRole("button", { name: "Log attempt" }));
    await waitFor(() => expect(Object.values(loadRoadmapProgress().problems)[0]?.attempts).toHaveLength(1));
    expect(Object.values(loadRoadmapProgress().problems)[0]?.minutesSpent).toBe(25);
  });

  it("previews, maps, confirms, and safely repeats a CSV import", async () => {
    render(<RoadmapBrowser/>);
    await screen.findByText("Imported from your Striver sheet");
    fireEvent.click(screen.getByText(/Import or review roadmap data/));
    const file = new File(["Chapter,Section,Problem,URL,Duration,Level,Order\nArrays,CSV additions,Unique demo item,https://example.org/item,35,Basic,1"], "additional.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText("CSV column mapping")).toBeTruthy();
    expect(screen.getByText("Unique demo item")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge import" }));
    expect(await screen.findByText(/1 imported · 0 updated · 0 unchanged/)).toBeTruthy();
    let saved = JSON.parse(window.localStorage.getItem(ROADMAP_CATALOG_KEY)!);
    let inserted = saved.sections.flatMap((section: { topics: Array<{ name: string; url: string | null; estimatedMinutes: number | null; id: string }> }) => section.topics).find((problem: { name: string }) => problem.name === "Unique demo item");
    expect(inserted.url).toBe("https://example.org/item");
    expect(inserted.estimatedMinutes).toBe(35);
    const id = inserted.id;

    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText("CSV column mapping")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge import" }));
    expect(await screen.findByText(/0 imported · 0 updated · 1 unchanged/)).toBeTruthy();
    saved = JSON.parse(window.localStorage.getItem(ROADMAP_CATALOG_KEY)!);
    inserted = saved.sections.flatMap((section: { topics: Array<{ name: string; url: string | null; estimatedMinutes: number | null; id: string }> }) => section.topics).find((problem: { name: string }) => problem.name === "Unique demo item");
    expect(inserted.id).toBe(id);
  });

  it("imports the actual preserved Striver text file through preview and confirm", async () => {
    render(<RoadmapBrowser/>);
    await screen.findByText("Imported from your Striver sheet");
    fireEvent.click(screen.getByText(/Import or review roadmap data/));
    const file = new File([sourceText], "striver-sheet.txt", { type: "text/plain" });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByText("Outline preview")).toBeTruthy();
    expect(screen.getByText(/104 sections · 495 problem entries · 15 contests/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm merge import" }));
    expect(await screen.findByText(/0 imported · 0 updated · 495 unchanged · 0 failed rows/)).toBeTruthy();
  });
});
