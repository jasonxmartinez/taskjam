import { describe, expect, it } from "vitest";
import { addProject, addSection, emptyState } from "../model/db";
import { parseQuickAdd } from "./quickAdd";

// Wednesday, Nov 25 2026, 10pm local.
const now = new Date(2026, 10, 25, 22, 0, 0);

function world() {
  let s = emptyState();
  const school = addProject(s, { name: "School" });
  s = school.state;
  const strat = addProject(s, { name: "Strategy for Managers", parentId: school.project.id });
  s = strat.state;
  const cwd = addProject(s, { name: "Competing with Digital", parentId: school.project.id });
  s = cwd.state;
  const personal = addProject(s, { name: "Personal" });
  s = personal.state;
  const career = addProject(s, { name: "careerSearch" });
  s = career.state;
  const pmm = addProject(s, { name: "PMM Career Development", parentId: career.project.id });
  s = pmm.state;
  const asg = addSection(s, { name: "Assignments", projectId: strat.project.id });
  s = asg.state;
  return { s, school: school.project, strat: strat.project, cwd: cwd.project, personal: personal.project, pmm: pmm.project, asg: asg.section };
}

describe("parseQuickAdd", () => {
  it("parses the full example: project, section, due+time, deadline, priority, duration", () => {
    const w = world();
    const p = parseQuickAdd("Case write-up #Strategy /Assignments tue 7pm {thu} p1 for 2h", w.s, { now });
    expect(p.title).toBe("Case write-up");
    expect(p.projectId).toBe(w.strat.id);
    expect(p.sectionId).toBe(w.asg.id);
    expect(p.dueDate).toBe("2026-12-01"); // next Tuesday
    expect(p.dueTime).toBe("19:00");
    expect(p.deadline).toBe("2026-11-26"); // Thursday
    expect(p.priority).toBe(1);
    expect(p.durationMin).toBe(120);
  });

  it("goes to Inbox (no project) with labels and a weekday", () => {
    const p = parseQuickAdd("Coffee chat with Dana @networking fri", world().s, { now });
    expect(p.title).toBe("Coffee chat with Dana");
    expect(p.projectId).toBeNull();
    expect(p.labels).toEqual(["networking"]);
    expect(p.dueDate).toBe("2026-11-27");
    expect(p.dueTime).toBeNull();
  });

  it("resolves #Parent/Sub and fuzzy names, and quoted names with spaces", () => {
    const w = world();
    expect(parseQuickAdd("x #School/Strategy", w.s, { now }).projectId).toBe(w.strat.id);
    expect(parseQuickAdd("x #strat", w.s, { now }).projectId).toBe(w.strat.id);
    expect(parseQuickAdd('x #"Competing with Digital"', w.s, { now }).projectId).toBe(w.cwd.id);
    expect(parseQuickAdd("Look into PMM cert #PMM @certs @skillsDev p2", w.s, { now })).toMatchObject({
      projectId: w.pmm.id,
      labels: ["certs", "skillsdev"],
      priority: 2,
      dueDate: null,
    });
  });

  it("reports an unknown project so the UI can offer to create it", () => {
    const p = parseQuickAdd("x #Nonexistent", world().s, { now });
    expect(p.projectId).toBeNull();
    expect(p.unresolvedProject).toBe("Nonexistent");
    expect(p.title).toBe("x");
  });

  it("parses recurrence and sets the first occurrence as the due date", () => {
    const p = parseQuickAdd("Replace contacts #Personal every month on the 12th p1", world().s, { now });
    expect(p.recurrence).toBe("every month on the 12th");
    expect(p.priority).toBe(1);
    expect(p.title).toBe("Replace contacts");
    const q = parseQuickAdd("Standup every mon", world().s, { now });
    expect(q.recurrence).toBe("every mon");
    expect(q.dueDate).toBe("2026-11-30");
  });

  it("parses duration forms and ignores a stray 'for'", () => {
    const w = world().s;
    expect(parseQuickAdd("a for 30m", w, { now }).durationMin).toBe(30);
    expect(parseQuickAdd("a for 1h30m", w, { now }).durationMin).toBe(90);
    const p = parseQuickAdd("Buy a gift for mom", w, { now });
    expect(p.durationMin).toBeNull();
    expect(p.title).toBe("Buy a gift for mom");
  });

  it("supports deadline with an explicit date and today/tomorrow due words", () => {
    const w = world().s;
    expect(parseQuickAdd("a {12/5}", w, { now }).deadline).toBe("2026-12-05");
    expect(parseQuickAdd("a tom", w, { now }).dueDate).toBe("2026-11-26");
    expect(parseQuickAdd("a today", w, { now }).dueDate).toBe("2026-11-25");
  });

  it("leaves the title alone when a token kind is disabled", () => {
    const p = parseQuickAdd("Read Tuesdays with Morrie", world().s, { now, disabled: new Set(["due"]) });
    expect(p.dueDate).toBeNull();
    expect(p.title).toBe("Read Tuesdays with Morrie");
  });

  it("returns token spans for highlighting", () => {
    const p = parseQuickAdd("Task #Personal p2", world().s, { now });
    expect(p.tokens.map((t) => [t.type, t.text])).toEqual([
      ["project", "#Personal"],
      ["priority", "p2"],
    ]);
  });
});

describe("parseQuickAdd abbreviations", () => {
  it("treats tom/tmr as tomorrow, with an optional time", () => {
    const w = world().s;
    expect(parseQuickAdd("a tmr 5pm", w, { now })).toMatchObject({ dueDate: "2026-11-26", dueTime: "17:00", title: "a" });
  });
});
