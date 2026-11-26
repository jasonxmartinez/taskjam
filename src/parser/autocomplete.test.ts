import { describe, expect, it } from "vitest";
import { addProject, addSection, emptyState, ensureLabels } from "../model/db";
import { applySuggestion, completeAt } from "./autocomplete";

function world() {
  let s = emptyState();
  const school = addProject(s, { name: "School" });
  s = school.state;
  const strat = addProject(s, { name: "Strategy for Managers", parentId: school.project.id });
  s = strat.state;
  const cwd = addProject(s, { name: "Competing with Digital", parentId: school.project.id });
  s = cwd.state;
  const schedule = addProject(s, { name: "Schedules" });
  s = schedule.state;
  const personal = addProject(s, { name: "Personal" });
  s = personal.state;
  s = addSection(s, { name: "Assignments", projectId: strat.project.id }).state;
  s = addSection(s, { name: "Readings", projectId: strat.project.id }).state;
  s = addSection(s, { name: "Errands", projectId: personal.project.id }).state;
  s = ensureLabels(s, ["errand", "email", "deep-work"]);
  return { s, school: school.project, strat: strat.project, personal: personal.project };
}

const at = (text: string, s = world().s, def?: string) => completeAt(text, text.length, s, def);
const labels = (text: string, s = world().s, def?: string) => at(text, s, def)?.items.map((i) => i.label) ?? null;

describe("completeAt", () => {
  it("suggests projects that start with what was typed", () => {
    expect(labels("Read case #sch")).toEqual(["School", "Schedules"]);
    expect(at("Read case #sch")!.start).toBe(10);
  });

  it("lists every project for a bare #", () => {
    expect(labels("x #")).toEqual(["Inbox", "School", "Strategy for Managers", "Competing with Digital", "Schedules", "Personal"]);
  });

  it("finds subprojects by their own name and inserts the full path, quoted", () => {
    const c = at("Case #str")!;
    expect(c.items[0]).toMatchObject({ label: "Strategy for Managers", hint: "School", insert: '#School/"Strategy for Managers"' });
  });

  it("matches later words after first-word matches", () => {
    expect(labels("x #dig")).toEqual(["Competing with Digital"]);
  });

  it("narrows to subprojects after Parent/", () => {
    expect(labels("x #School/")).toEqual(["Strategy for Managers", "Competing with Digital"]);
    expect(labels("x #sch/com")).toEqual(["Competing with Digital"]);
  });

  it("suggests sections of the project already typed", () => {
    expect(labels('x #School/Strategy /')).toEqual(["Assignments", "Readings"]);
    expect(labels('x #School/Strategy /re')).toEqual(["Readings"]);
    expect(at("x #School/Strategy /re")!.items[0].insert).toBe("/Readings");
  });

  it("uses the default project when none is typed", () => {
    const w = world();
    expect(labels("x /", w.s, w.personal.id)).toEqual(["Errands"]);
  });

  it("with no project, offers every section and adds its project on pick", () => {
    const c = at("Pick up dry cleaning /err")!;
    expect(c.items.map((i) => i.label)).toEqual(["Errands"]);
    expect(c.items[0].insert).toBe("#Personal /Errands");
  });

  it("suggests priorities", () => {
    expect(labels("x p")).toEqual(["p1", "p2", "p3", "p4"]);
    expect(at("x p1")).toBeNull(); // already complete
    expect(at("x pay")).toBeNull();
  });

  it("suggests labels by prefix", () => {
    expect(labels("x @e")).toEqual(["email", "errand"]);
    expect(labels("x @")).toEqual(["deep-work", "email", "errand"]);
  });

  it("returns nothing outside a token or with no match", () => {
    expect(at("Read case")).toBeNull();
    expect(at("x #zzz")).toBeNull();
    expect(at("a#b")).toBeNull();
  });

  it("handles a quoted name still being typed", () => {
    expect(labels('x #"Strategy f')).toEqual(["Strategy for Managers"]);
  });

  it("works with the caret mid-text", () => {
    const text = "Read #sch tomorrow";
    const c = completeAt(text, 9, world().s)!;
    expect(c.items[0].label).toBe("School");
    const out = applySuggestion(text, c, c.items[0]);
    expect(out.text).toBe("Read #School tomorrow");
    expect(out.caret).toBe(13);
  });

  it("adds a trailing space when picking at the end", () => {
    const text = "Read #sch";
    const c = at(text)!;
    expect(applySuggestion(text, c, c.items[0])).toEqual({ text: "Read #School ", caret: 13 });
  });
});
