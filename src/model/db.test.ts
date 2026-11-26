import { describe, expect, it } from "vitest";
import {
  addProject,
  addSection,
  addTask,
  completeTask,
  elapsedSec,
  emptyState,
  formatHMS,
  moveTask,
  parseHMS,
  pauseTimer,
  placeProject,
  placeTask,
  projectTasks,
  projectTree,
  renameProject,
  setProjectColor,
  setTimeSpent,
  startTimer,
  todayTasks,
} from "./db";
import { DEFAULT_PROJECT_COLOR, INBOX_ID } from "./types";

describe("projects and sections", () => {
  it("allows one level of subprojects only", () => {
    let s = emptyState();
    const a = addProject(s, { name: "School" });
    const b = addProject(a.state, { name: "Strategy", parentId: a.project.id });
    expect(() => addProject(b.state, { name: "Week 3", parentId: b.project.id })).toThrow(/Subprojects/);
    expect(projectTree(b.state)[0].children.map((c) => c.name)).toEqual(["Strategy"]);
    s = b.state;
    expect(() => addProject(s, { name: "x", parentId: INBOX_ID })).toThrow(/Inbox/);
  });

  it("sections take any name and not on Inbox", () => {
    const p = addProject(emptyState(), { name: "School" });
    const sec = addSection(p.state, { name: "Group Projects ✨", projectId: p.project.id });
    expect(sec.section.name).toBe("Group Projects ✨");
    expect(() => addSection(p.state, { name: "x", projectId: INBOX_ID })).toThrow();
  });
});

describe("tasks", () => {
  it("defaults to Inbox, P4, a 10-minute reminder", () => {
    const { task } = addTask(emptyState(), { title: "Call mom" });
    expect(task).toMatchObject({ projectId: INBOX_ID, priority: 4, reminders: [10], parentId: null });
  });

  it("subtasks nest one level, inherit location, and travel with the parent", () => {
    const p = addProject(emptyState(), { name: "School" });
    const sec = addSection(p.state, { name: "Assignments", projectId: p.project.id });
    const parent = addTask(sec.state, { title: "Paper", projectId: p.project.id, sectionId: sec.section.id });
    const sub = addTask(parent.state, { title: "Outline", parentId: parent.task.id, priority: 1, dueDate: "2026-12-01" });
    expect(sub.task).toMatchObject({ projectId: p.project.id, sectionId: sec.section.id, priority: 1 });
    expect(() => addTask(sub.state, { title: "deeper", parentId: sub.task.id })).toThrow(/Subtasks/);
    const other = addProject(sub.state, { name: "Personal" });
    const moved = moveTask(other.state, parent.task.id, { projectId: other.project.id });
    expect(moved.tasks.every((t) => t.projectId === other.project.id)).toBe(true);
  });

  it("creates labels on the fly", () => {
    const { state } = addTask(emptyState(), { title: "x", labels: ["Networking"] });
    expect(state.labels.map((l) => l.name)).toEqual(["networking"]);
  });

  it("Today lists overdue separately and skips completed tasks", () => {
    let s = addTask(emptyState(), { title: "old", dueDate: "2026-11-20" }).state;
    s = addTask(s, { title: "now", dueDate: "2026-11-25" }).state;
    const done = addTask(s, { title: "done", dueDate: "2026-11-25" });
    s = completeTask(done.state, done.task.id);
    const t = todayTasks(s, "2026-11-25");
    expect(t.overdue.map((x) => x.title)).toEqual(["old"]);
    expect(t.today.map((x) => x.title)).toEqual(["now"]);
  });
});

describe("task timer", () => {
  const t0 = 1_000_000;

  it("runs, pauses, and keeps counting from the stored start time", () => {
    let { state, task } = addTask(emptyState(), { title: "Read case" });
    state = startTimer(state, task.id, t0);
    expect(elapsedSec(state.tasks[0], t0 + 90_000)).toBe(90);
    state = pauseTimer(state, task.id, t0 + 90_000);
    expect(state.tasks[0]).toMatchObject({ timeSpentSec: 90, timerStartedAt: null });
    state = startTimer(state, task.id, t0 + 200_000);
    expect(elapsedSec(state.tasks[0], t0 + 230_000)).toBe(120);
  });

  it("starting a second timer pauses the first", () => {
    const a = addTask(emptyState(), { title: "a" });
    const b = addTask(a.state, { title: "b" });
    let s = startTimer(b.state, a.task.id, t0);
    s = startTimer(s, b.task.id, t0 + 60_000);
    expect(s.tasks.find((t) => t.id === a.task.id)).toMatchObject({ timeSpentSec: 60, timerStartedAt: null });
    expect(s.tasks.find((t) => t.id === b.task.id)?.timerStartedAt).toBe(t0 + 60_000);
  });

  it("completing a task stops its timer; time can be edited afterwards", () => {
    const a = addTask(emptyState(), { title: "a" });
    let s = startTimer(a.state, a.task.id, t0);
    s = completeTask(s, a.task.id, t0 + 30_000);
    expect(s.tasks[0]).toMatchObject({ timeSpentSec: 30, timerStartedAt: null, completedAt: t0 + 30_000 });
    s = setTimeSpent(s, a.task.id, 3725);
    expect(formatHMS(s.tasks[0].timeSpentSec)).toBe("1:02:05");
    expect(() => startTimer(s, a.task.id)).toThrow(/completed/);
  });

  it("formats and parses h:m:s", () => {
    expect(parseHMS("1:02:05")).toBe(3725);
    expect(parseHMS("5:09")).toBe(309);
    expect(parseHMS("45")).toBe(45);
    expect(parseHMS("1:75:00")).toBeNull();
    expect(parseHMS("abc")).toBeNull();
  });
});

describe("editing and arranging projects", () => {
  it("renames and recolors; new projects default to grey", () => {
    const a = addProject(emptyState(), { name: "Home" });
    expect(a.project.color).toBe(DEFAULT_PROJECT_COLOR);
    let s = renameProject(a.state, a.project.id, "  House ");
    s = setProjectColor(s, a.project.id, "#ef4444");
    expect(s.projects.find((p) => p.id === a.project.id)).toMatchObject({ name: "House", color: "#ef4444" });
    expect(() => renameProject(s, a.project.id, " ")).toThrow(/required/);
    expect(() => renameProject(s, INBOX_ID, "Box")).toThrow(/Inbox/);
    expect(addProject(s, { name: "Red", color: "#ef4444" }).project.color).toBe("#ef4444");
  });

  it("reorders, nests and un-nests one level only", () => {
    const a = addProject(emptyState(), { name: "A" });
    const b = addProject(a.state, { name: "B" });
    const c = addProject(b.state, { name: "C" });
    const a1 = addProject(c.state, { name: "A1", parentId: a.project.id });
    let s = a1.state;
    const names = (st = s) => projectTree(st).map((n) => [n.project.name, ...n.children.map((x) => x.name)].join(">"));

    s = placeProject(s, c.project.id, { parentId: null, index: 0 });
    expect(names()).toEqual(["C", "A>A1", "B"]);
    s = placeProject(s, b.project.id, { parentId: a.project.id, index: 0 });
    expect(names()).toEqual(["C", "A>B>A1"]);
    s = placeProject(s, a1.project.id, { parentId: null, index: 1 });
    expect(names()).toEqual(["C", "A1", "A>B"]);
    // A has a subproject, so it cannot go under C; nothing goes under a subproject.
    expect(() => placeProject(s, a.project.id, { parentId: c.project.id, index: 0 })).toThrow(/one level/);
    expect(() => placeProject(s, c.project.id, { parentId: b.project.id, index: 0 })).toThrow(/one level/);
    expect(() => placeProject(s, c.project.id, { parentId: c.project.id, index: 0 })).toThrow(/one level/);
  });
});

describe("dragging tasks in a project", () => {
  it("reorders within a section and moves between sections and projects with subtasks", () => {
    const p = addProject(emptyState(), { name: "P" });
    const q = addProject(p.state, { name: "Q" });
    const sec = addSection(q.state, { name: "Doing", projectId: p.project.id });
    let s = sec.state;
    const ids: string[] = [];
    for (const title of ["one", "two", "three"]) {
      const r = addTask(s, { title, projectId: p.project.id });
      s = r.state;
      ids.push(r.task.id);
    }
    const sub = addTask(s, { title: "sub", parentId: ids[0] });
    s = sub.state;
    const titles = (st = s) => {
      const v = projectTasks(st, p.project.id);
      return [v.unsectioned.map((t) => t.title), ...v.sections.map((x) => x.tasks.map((t) => t.title))];
    };

    s = placeTask(s, ids[2], { projectId: p.project.id, sectionId: null, index: 0 });
    expect(titles()).toEqual([["three", "one", "two"], []]);
    s = placeTask(s, ids[0], { projectId: p.project.id, sectionId: sec.section.id, index: 0 });
    expect(titles()).toEqual([["three", "two"], ["one"]]);
    expect(s.tasks.find((t) => t.id === sub.task.id)!.sectionId).toBe(sec.section.id);
    s = placeTask(s, ids[0], { projectId: q.project.id, sectionId: null, index: 0 });
    expect(titles()).toEqual([["three", "two"], []]);
    expect(s.tasks.find((t) => t.id === sub.task.id)!.projectId).toBe(q.project.id);
    expect(() => placeTask(s, sub.task.id, { projectId: p.project.id, sectionId: null, index: 0 })).toThrow(/Subtasks/);
  });
});
