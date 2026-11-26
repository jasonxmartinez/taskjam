import { localDate } from "../model/db";
import { INBOX_ID, type AppState, type Task } from "../model/types";

export interface DayStat {
  date: string; // YYYY-MM-DD
  completed: number;
  timeSec: number;
}

export interface ProjectStat {
  projectId: string;
  name: string;
  completed: number;
  timeSec: number;
}

export interface Stats {
  today: number;
  week: number; // Monday to today
  month: number; // calendar month to today
  streak: number;
  days: DayStat[]; // last `windowDays` days, oldest first
  projects: ProjectStat[]; // completions in the window, most first
  totalTimeSec: number; // in the window
}

const day = (ms: number) => localDate(new Date(ms));

function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Mon = 0
  return addDays(date, -dow);
}

/**
 * Productivity numbers from completed tasks (subtasks included).
 * Time from the task timer is credited to the day the task was completed,
 * since the timer stores a running total per task, not sessions.
 */
export function computeStats(state: AppState, today: string, windowDays = 28): Stats {
  const done = state.tasks.filter((t): t is Task & { completedAt: number } => t.completedAt !== null);
  const perDay = new Map<string, { completed: number; timeSec: number }>();
  for (const t of done) {
    const k = day(t.completedAt);
    const e = perDay.get(k) ?? { completed: 0, timeSec: 0 };
    e.completed += 1;
    e.timeSec += t.timeSpentSec;
    perDay.set(k, e);
  }

  const days: DayStat[] = Array.from({ length: windowDays }, (_, i) => {
    const date = addDays(today, i - (windowDays - 1));
    const e = perDay.get(date);
    return { date, completed: e?.completed ?? 0, timeSec: e?.timeSec ?? 0 };
  });

  const sumFrom = (from: string) =>
    [...perDay].filter(([k]) => k >= from && k <= today).reduce((n, [, v]) => n + v.completed, 0);

  // Streak: consecutive days with a completion. Today may still be empty without breaking it.
  let streak = 0;
  let cursor = (perDay.get(today)?.completed ?? 0) > 0 ? today : addDays(today, -1);
  while ((perDay.get(cursor)?.completed ?? 0) > 0) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const windowStart = days[0].date;
  const byProject = new Map<string, ProjectStat>();
  for (const t of done) {
    const k = day(t.completedAt);
    if (k < windowStart || k > today) continue;
    const project = state.projects.find((p) => p.id === t.projectId);
    const parent = project?.parentId ? state.projects.find((p) => p.id === project.parentId) : null;
    const name = t.projectId === INBOX_ID ? "Inbox" : parent ? `${parent.name} / ${project!.name}` : (project?.name ?? "Unknown");
    const e = byProject.get(t.projectId) ?? { projectId: t.projectId, name, completed: 0, timeSec: 0 };
    e.completed += 1;
    e.timeSec += t.timeSpentSec;
    byProject.set(t.projectId, e);
  }

  return {
    today: perDay.get(today)?.completed ?? 0,
    week: sumFrom(weekStart(today)),
    month: sumFrom(today.slice(0, 8) + "01"),
    streak,
    days,
    projects: [...byProject.values()].sort((a, b) => b.completed - a.completed || b.timeSec - a.timeSec),
    totalTimeSec: days.reduce((n, d) => n + d.timeSec, 0),
  };
}
