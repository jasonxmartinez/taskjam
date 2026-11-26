import { describe, expect, it } from "vitest";
import { addProject, addTask, completeTask, emptyState, setTimeSpent } from "../model/db";
import type { AppState } from "../model/types";
import { computeStats, weekStart } from "./stats";

// Wed 2026-11-25
const TODAY = "2026-11-25";
const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();

function complete(s: AppState, title: string, day: number, opts: { projectId?: string; sec?: number } = {}): AppState {
  const a = addTask(s, { title, projectId: opts.projectId });
  let next = a.state;
  if (opts.sec) next = setTimeSpent(next, a.task.id, opts.sec);
  return completeTask(next, a.task.id, at(day));
}

describe("stats", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-11-25")).toBe("2026-11-23");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23"); // Sunday
  });

  it("counts today, this week (Mon start), and this month", () => {
    let s = emptyState();
    s = complete(s, "a", 25);
    s = complete(s, "b", 25);
    s = complete(s, "c", 23); // Monday
    s = complete(s, "d", 22); // Sunday, last week
    s = complete(s, "e", 2); // earlier this month
    const st = computeStats(s, TODAY);
    expect([st.today, st.week, st.month]).toEqual([2, 3, 5]);
  });

  it("streak survives an empty today but not an empty yesterday", () => {
    let s = emptyState();
    s = complete(s, "a", 24);
    s = complete(s, "b", 23);
    expect(computeStats(s, TODAY).streak).toBe(2); // today empty, still alive
    s = complete(s, "c", 25);
    expect(computeStats(s, TODAY).streak).toBe(3);
    expect(computeStats(complete(emptyState(), "x", 22), TODAY).streak).toBe(0);
  });

  it("returns a 28-day window with zeros filled in", () => {
    const st = computeStats(complete(emptyState(), "a", 25), TODAY);
    expect(st.days).toHaveLength(28);
    expect(st.days[27]).toMatchObject({ date: TODAY, completed: 1 });
    expect(st.days[26].completed).toBe(0);
  });

  it("totals time and completions per project, subproject names include the parent", () => {
    let s = emptyState();
    const school = addProject(s, { name: "School" });
    const strat = addProject(school.state, { name: "Strategy", parentId: school.project.id });
    s = complete(strat.state, "case", 25, { projectId: strat.project.id, sec: 3600 });
    s = complete(s, "read", 24, { projectId: strat.project.id, sec: 1800 });
    s = complete(s, "call", 25);
    const st = computeStats(s, TODAY);
    expect(st.projects[0]).toMatchObject({ name: "School / Strategy", completed: 2, timeSec: 5400 });
    expect(st.projects[1].name).toBe("Inbox");
    expect(st.totalTimeSec).toBe(5400);
    expect(st.days[27].timeSec).toBe(3600);
  });

  it("ignores open tasks", () => {
    const s = addTask(emptyState(), { title: "open" }).state;
    expect(computeStats(s, TODAY)).toMatchObject({ today: 0, streak: 0, projects: [] });
  });
});
