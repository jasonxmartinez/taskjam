import {
  DEFAULT_PROJECT_COLOR,
  DEFAULT_REMINDERS,
  INBOX_ID,
  type AppState,
  type Label,
  type Priority,
  type Project,
  type Section,
  type Task,
} from "./types";

export const newId = () => crypto.randomUUID();

export function emptyState(): AppState {
  return {
    projects: [
      { id: INBOX_ID, name: "Inbox", color: "#64748b", parentId: null, order: 0, archived: false },
    ],
    sections: [],
    tasks: [],
    labels: [],
  };
}

const byId = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id);

// ---------- projects ----------

export function addProject(
  s: AppState,
  input: { name: string; parentId?: string | null; color?: string },
): { state: AppState; project: Project } {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const parentId = input.parentId ?? null;
  if (parentId) {
    const parent = byId(s.projects, parentId);
    if (!parent) throw new Error("Parent project not found");
    if (parent.id === INBOX_ID) throw new Error("Inbox cannot have subprojects");
    if (parent.parentId) throw new Error("Subprojects cannot have their own subprojects");
  }
  const siblings = s.projects.filter((p) => p.parentId === parentId);
  const project: Project = {
    id: newId(),
    name,
    color: input.color ?? DEFAULT_PROJECT_COLOR,
    parentId,
    order: siblings.length,
    archived: false,
  };
  return { state: { ...s, projects: [...s.projects, project] }, project };
}

export function renameProject(s: AppState, id: string, name: string): AppState {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Project name is required");
  if (id === INBOX_ID) throw new Error("Inbox cannot be renamed");
  if (!byId(s.projects, id)) throw new Error("Project not found");
  return { ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) };
}

export function setProjectColor(s: AppState, id: string, color: string): AppState {
  if (!byId(s.projects, id)) throw new Error("Project not found");
  return { ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, color } : p)) };
}

/** Whether `id` may be dropped under `parentId` (one level of nesting only). */
export function canNestProject(s: AppState, id: string, parentId: string | null): boolean {
  if (!parentId) return id !== INBOX_ID;
  if (id === INBOX_ID || id === parentId || parentId === INBOX_ID) return false;
  const parent = byId(s.projects, parentId);
  if (!parent || parent.parentId) return false;
  // A project that has its own subprojects cannot become a subproject.
  return !s.projects.some((p) => p.parentId === id && !p.archived);
}

/**
 * Moves a project to `index` among the live children of `parentId` (null = top level),
 * renumbering both the old and the new sibling lists.
 */
export function placeProject(s: AppState, id: string, to: { parentId: string | null; index: number }): AppState {
  const project = byId(s.projects, id);
  if (!project) throw new Error("Project not found");
  if (!canNestProject(s, id, to.parentId)) throw new Error("Projects can only be nested one level deep");
  const siblings = (parentId: string | null) =>
    s.projects
      .filter((p) => p.parentId === parentId && p.id !== id && p.id !== INBOX_ID && !p.archived)
      .sort((a, b) => a.order - b.order);
  const target = siblings(to.parentId);
  const index = Math.max(0, Math.min(to.index, target.length));
  target.splice(index, 0, { ...project, parentId: to.parentId });
  const order = new Map<string, { order: number; parentId: string | null }>();
  target.forEach((p, i) => order.set(p.id, { order: i, parentId: to.parentId }));
  if (project.parentId !== to.parentId) siblings(project.parentId).forEach((p, i) => order.set(p.id, { order: i, parentId: p.parentId }));
  return { ...s, projects: s.projects.map((p) => (order.has(p.id) ? { ...p, ...order.get(p.id)! } : p)) };
}

// ---------- sections ----------

export function addSection(
  s: AppState,
  input: { name: string; projectId: string },
): { state: AppState; section: Section } {
  const name = input.name.trim();
  if (!name) throw new Error("Section name is required");
  if (input.projectId === INBOX_ID) throw new Error("Inbox cannot have sections");
  if (!byId(s.projects, input.projectId)) throw new Error("Project not found");
  const section: Section = {
    id: newId(),
    name,
    projectId: input.projectId,
    order: s.sections.filter((x) => x.projectId === input.projectId).length,
  };
  return { state: { ...s, sections: [...s.sections, section] }, section };
}

// ---------- labels ----------

export function ensureLabels(s: AppState, names: string[]): AppState {
  const missing = names
    .map((n) => n.toLowerCase())
    .filter((n, i, a) => a.indexOf(n) === i && !s.labels.some((l) => l.name === n));
  if (!missing.length) return s;
  const added: Label[] = missing.map((name) => ({ name, color: "#94a3b8" }));
  return { ...s, labels: [...s.labels, ...added] };
}

// ---------- tasks ----------

export interface NewTask {
  title: string;
  notes?: string;
  projectId?: string;
  sectionId?: string | null;
  parentId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  dueTime?: string | null;
  deadline?: string | null;
  labels?: string[];
  recurrence?: string | null;
  durationMin?: number | null;
  reminders?: number[];
}

export function addTask(s: AppState, input: NewTask, now = Date.now()): { state: AppState; task: Task } {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");

  let projectId = input.projectId ?? INBOX_ID;
  let sectionId = input.sectionId ?? null;
  const parentId = input.parentId ?? null;

  if (parentId) {
    const parent = byId(s.tasks, parentId);
    if (!parent) throw new Error("Parent task not found");
    if (parent.parentId) throw new Error("Subtasks cannot have their own subtasks");
    // Subtasks default to their parent's location.
    if (!input.projectId) projectId = parent.projectId;
    if (input.sectionId === undefined) sectionId = parent.sectionId;
  }
  if (!byId(s.projects, projectId)) throw new Error("Project not found");
  if (sectionId) {
    const sec = byId(s.sections, sectionId);
    if (!sec || sec.projectId !== projectId) throw new Error("Section does not belong to that project");
  }

  const labels = (input.labels ?? []).map((l) => l.toLowerCase());
  const dueDate = input.dueDate ?? null;
  const task: Task = {
    id: newId(),
    title,
    notes: input.notes ?? "",
    projectId,
    sectionId,
    parentId,
    priority: input.priority ?? 4,
    dueDate,
    dueTime: dueDate ? (input.dueTime ?? null) : null,
    deadline: input.deadline ?? null,
    labels,
    recurrence: input.recurrence ?? null,
    durationMin: input.durationMin ?? null,
    reminders: input.reminders ?? [...DEFAULT_REMINDERS],
    timeSpentSec: 0,
    timerStartedAt: null,
    completedAt: null,
    createdAt: now,
    // New tasks go to the bottom of their list.
    order: s.tasks
      .filter((t) => t.projectId === projectId && t.parentId === parentId)
      .reduce((max, t) => Math.max(max, t.order + 1), 0),
  };
  const next = ensureLabels({ ...s, tasks: [...s.tasks, task] }, labels);
  return { state: next, task };
}

export function updateTask(s: AppState, id: string, patch: Partial<Omit<Task, "id">>): AppState {
  if (!byId(s.tasks, id)) throw new Error("Task not found");
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function moveTask(
  s: AppState,
  id: string,
  to: { projectId: string; sectionId?: string | null },
): AppState {
  const task = byId(s.tasks, id);
  if (!task) throw new Error("Task not found");
  if (!byId(s.projects, to.projectId)) throw new Error("Project not found");
  const sectionId = to.sectionId ?? null;
  if (sectionId) {
    const sec = byId(s.sections, sectionId);
    if (!sec || sec.projectId !== to.projectId) throw new Error("Section does not belong to that project");
  }
  // Subtasks travel with their parent.
  return {
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id || t.parentId === id ? { ...t, projectId: to.projectId, sectionId } : t,
    ),
  };
}

/**
 * Drag and drop in a project view: puts a top-level task at `index` among the open
 * top-level tasks of `projectId` + `sectionId`, moving it (and its subtasks) there if needed.
 */
export function placeTask(
  s: AppState,
  id: string,
  to: { projectId: string; sectionId: string | null; index: number },
): AppState {
  const task = byId(s.tasks, id);
  if (!task) throw new Error("Task not found");
  if (task.parentId) throw new Error("Subtasks move with their parent");
  let next = task.projectId === to.projectId && task.sectionId === to.sectionId ? s : moveTask(s, id, to);
  const moved = byId(next.tasks, id)!;
  const list = next.tasks
    .filter((t) => !t.completedAt && !t.parentId && t.projectId === to.projectId && t.sectionId === to.sectionId && t.id !== id)
    .sort((a, b) => a.order - b.order);
  list.splice(Math.max(0, Math.min(to.index, list.length)), 0, moved);
  const order = new Map(list.map((t, i) => [t.id, i]));
  next = { ...next, tasks: next.tasks.map((t) => (order.has(t.id) ? { ...t, order: order.get(t.id)! } : t)) };
  return next;
}

/** Deletes a task and its subtasks. */
export function deleteTask(s: AppState, id: string): AppState {
  if (!byId(s.tasks, id)) throw new Error("Task not found");
  return { ...s, tasks: s.tasks.filter((t) => t.id !== id && t.parentId !== id) };
}

// ---------- completion & timer ----------

/** Seconds recorded so far, including a running stretch. */
export function elapsedSec(t: Task, now = Date.now()): number {
  return t.timeSpentSec + (t.timerStartedAt ? Math.max(0, Math.floor((now - t.timerStartedAt) / 1000)) : 0);
}

function stopped(t: Task, now: number): Task {
  return t.timerStartedAt ? { ...t, timeSpentSec: elapsedSec(t, now), timerStartedAt: null } : t;
}

export function startTimer(s: AppState, id: string, now = Date.now()): AppState {
  const task = byId(s.tasks, id);
  if (!task) throw new Error("Task not found");
  if (task.completedAt) throw new Error("Cannot time a completed task");
  // One timer at a time: starting one pauses any other.
  return {
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...t, timerStartedAt: t.timerStartedAt ?? now } : stopped(t, now))),
  };
}

export function pauseTimer(s: AppState, id: string, now = Date.now()): AppState {
  if (!byId(s.tasks, id)) throw new Error("Task not found");
  return { ...s, tasks: s.tasks.map((t) => (t.id === id ? stopped(t, now) : t)) };
}

/** Marking complete stops the timer automatically. */
export function completeTask(s: AppState, id: string, now = Date.now()): AppState {
  if (!byId(s.tasks, id)) throw new Error("Task not found");
  return {
    ...s,
    tasks: s.tasks.map((t) => (t.id === id ? { ...stopped(t, now), completedAt: now } : t)),
  };
}

export function uncompleteTask(s: AppState, id: string): AppState {
  return updateTask(s, id, { completedAt: null });
}

/** Manual edit of time spent (hours, minutes, seconds), e.g. after forgetting to check a task off. */
export function setTimeSpent(s: AppState, id: string, sec: number, now = Date.now()): AppState {
  if (!Number.isFinite(sec) || sec < 0) throw new Error("Time must be zero or more seconds");
  const task = byId(s.tasks, id);
  if (!task) throw new Error("Task not found");
  // If the timer is running, keep it running from now on top of the new base.
  return updateTask(s, id, {
    timeSpentSec: Math.floor(sec),
    timerStartedAt: task.timerStartedAt ? now : null,
  });
}

export function formatHMS(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(sec)}`;
}

/** Parses "1:05:09", "5:09" or "45" (seconds) into seconds; null if invalid. */
export function parseHMS(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  while (nums.length < 3) nums.unshift(0);
  const [h, m, s] = nums;
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}

// ---------- selectors ----------

export const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const open = (t: Task) => !t.completedAt;
const sortTasks = (a: Task, b: Task) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  (a.dueTime ?? "99:99").localeCompare(b.dueTime ?? "99:99") ||
  a.priority - b.priority ||
  a.order - b.order;

export function inboxTasks(s: AppState): Task[] {
  return s.tasks.filter((t) => open(t) && !t.parentId && t.projectId === INBOX_ID).sort((a, b) => b.createdAt - a.createdAt);
}

export function todayTasks(s: AppState, today: string): { overdue: Task[]; today: Task[] } {
  const live = s.tasks.filter((t) => open(t) && !t.parentId && t.dueDate);
  return {
    overdue: live.filter((t) => t.dueDate! < today).sort(sortTasks),
    today: live.filter((t) => t.dueDate === today).sort(sortTasks),
  };
}

/** Tasks finished today that were on Today; they stay there, struck through, until tomorrow. */
export function doneToday(s: AppState, today: string, now = Date.now()): Task[] {
  return s.tasks
    .filter((t) => t.completedAt && !t.parentId && t.dueDate && t.dueDate <= today && localDate(new Date(t.completedAt)) === localDate(new Date(now)))
    .sort((a, b) => a.completedAt! - b.completedAt!);
}

/** Open tasks with a deadline in the next `days` days that are not already on Today. */
export function deadlinesSoon(s: AppState, today: string, days = 3): Task[] {
  const [y, m, d] = today.split("-").map(Number);
  const last = localDate(new Date(y, m - 1, d + days));
  return s.tasks
    .filter((t) => open(t) && !t.parentId && t.deadline && t.deadline >= today && t.deadline <= last && !(t.dueDate && t.dueDate <= today))
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!) || a.priority - b.priority);
}

/** Open top-level tasks per project id, for sidebar counts. */
export function openCounts(s: AppState): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of s.tasks) if (open(t) && !t.parentId) out.set(t.projectId, (out.get(t.projectId) ?? 0) + 1);
  return out;
}

/** Planned duration typed by hand: "90", "45m", "2h", "1h30m", "1.5h", "1:30". Null if invalid. */
export function parseDurationText(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "");
  if (!t) return null;
  let m = /^(\d+):(\d{1,2})$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]) || null;
  if (/^\d+$/.test(t)) return Number(t) || null;
  m = /^(?:(\d+(?:\.\d+)?)(?:h|hr|hrs|hours?))?(?:(\d+)(?:m|min|mins|minutes?))?$/.exec(t);
  if (!m || (!m[1] && !m[2])) return null;
  const min = Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
  return min > 0 ? min : null;
}

export function subtasksOf(s: AppState, parentId: string): Task[] {
  return s.tasks.filter((t) => t.parentId === parentId).sort((a, b) => a.order - b.order);
}

export function projectTree(s: AppState): { project: Project; children: Project[] }[] {
  const live = s.projects.filter((p) => !p.archived && p.id !== INBOX_ID);
  return live
    .filter((p) => !p.parentId)
    .sort((a, b) => a.order - b.order)
    .map((project) => ({
      project,
      children: live.filter((c) => c.parentId === project.id).sort((a, b) => a.order - b.order),
    }));
}

/** Project views use the manual (drag and drop) order. */
export function projectTasks(s: AppState, projectId: string) {
  const tasks = s.tasks
    .filter((t) => open(t) && !t.parentId && t.projectId === projectId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const sections = s.sections.filter((x) => x.projectId === projectId).sort((a, b) => a.order - b.order);
  return {
    unsectioned: tasks.filter((t) => !t.sectionId),
    sections: sections.map((section) => ({ section, tasks: tasks.filter((t) => t.sectionId === section.id) })),
  };
}
