import { INBOX_ID, type AppState, type Task } from "../model/types";

const parse = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
};

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function dayDiff(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", "Mon" within a week, otherwise "Nov 3". */
export function shortDay(date: string, today: string): string {
  const diff = dayDiff(today, date);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const d = parse(date);
  if (Math.abs(diff) < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "13:05" -> "1:05 PM". */
export function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "9:00 – 10:15 AM", "11:00 AM – 12:00 PM". */
export function timeRange(start: string, durationMin: number): string {
  const [h, m] = start.split(":").map(Number);
  const endMin = Math.min(h * 60 + m + durationMin, 24 * 60 - 1);
  const end = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
  const a = fmtTime(start);
  const b = fmtTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

/** Due date for a task row. On Today, today's tasks show just the time. */
export function dueLabel(t: Task, today: string, timeOnlyToday = false): string | null {
  if (!t.dueDate) return null;
  if (timeOnlyToday && t.dueDate === today) return t.dueTime ? fmtTime(t.dueTime) : null;
  const day = shortDay(t.dueDate, today);
  return t.dueTime ? `${day}, ${fmtTime(t.dueTime)}` : day;
}

/** "Sat, 2 days left", "Today", "Mon, 3 days late". */
export function deadlineLabel(deadline: string, today: string): string {
  const diff = dayDiff(today, deadline);
  if (diff === 0) return "Today";
  const d = parse(deadline);
  const day = Math.abs(diff) < 7 ? d.toLocaleDateString("en-US", { weekday: "short" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const n = Math.abs(diff);
  return diff > 0 ? `${day}, ${n} day${n === 1 ? "" : "s"} left` : `${day}, ${n} day${n === 1 ? "" : "s"} late`;
}

/** "Thursday, November 26". */
export function longDate(date: string): string {
  return parse(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/** "Nov 23". */
export function monthDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TINTS: Record<string, string> = {
  "#94a3b8": "var(--tint-grey)",
  "#ef4444": "var(--tint-red)",
  "#f97316": "var(--tint-orange)",
  "#eab308": "var(--tint-yellow)",
  "#22c55e": "var(--tint-green)",
  "#14b8a6": "var(--tint-green)",
  "#3b82f6": "var(--tint-blue)",
  "#6366f1": "var(--tint-purple)",
  "#a855f7": "var(--tint-purple)",
  "#ec4899": "var(--tint-red)",
  "#a16207": "var(--tint-orange)",
};

/** The pastel calendar fill closest to a project color. */
export function tintFor(color: string | undefined): string {
  return (color && TINTS[color.toLowerCase()]) ?? "var(--tint-grey)";
}

/** Where a task lives: ["School", "Strategy", "Assignments"]. */
export function breadcrumb(s: AppState, t: Task): string[] {
  if (t.projectId === INBOX_ID) return ["Inbox"];
  const project = s.projects.find((p) => p.id === t.projectId);
  const parent = project?.parentId ? s.projects.find((p) => p.id === project.parentId) : null;
  const section = t.sectionId ? s.sections.find((x) => x.id === t.sectionId) : null;
  return [parent?.name, project?.name, section?.name].filter((x): x is string => !!x);
}

export const PRIORITY_RING: Record<number, string> = {
  1: "var(--priority-1)",
  2: "var(--priority-2)",
  3: "var(--priority-3)",
  4: "var(--line-strong)",
};
