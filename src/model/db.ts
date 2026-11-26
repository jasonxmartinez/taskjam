import {
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
    color: input.color ?? "#6366f1",
    parentId,
    order: siblings.length,
    archived: false,
  };
  return { state: { ...s, projects: [...s.projects, project] }, project };
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
    order: s.tasks.filter((t) => t.projectId === projectId && t.parentId === parentId).length,
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

export function projectTasks(s: AppState, projectId: string) {
  const tasks = s.tasks.filter((t) => open(t) && !t.parentId && t.projectId === projectId).sort(sortTasks);
  const sections = s.sections.filter((x) => x.projectId === projectId).sort((a, b) => a.order - b.order);
  return {
    unsectioned: tasks.filter((t) => !t.sectionId),
    sections: sections.map((section) => ({ section, tasks: tasks.filter((t) => t.sectionId === section.id) })),
  };
}
