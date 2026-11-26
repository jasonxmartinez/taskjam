export type Priority = 1 | 2 | 3 | 4; // 1 = P1 (urgent) ... 4 = none (default)

export const INBOX_ID = "inbox";

export interface Project {
  id: string;
  name: string;
  color: string;
  /** Null for top-level projects. Only one level of nesting is allowed. */
  parentId: string | null;
  order: number;
  archived: boolean;
}

export interface Section {
  id: string;
  name: string;
  projectId: string;
  order: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  projectId: string; // INBOX_ID when uncategorized
  sectionId: string | null;
  /** Null for top-level tasks. Only one level of subtasks is allowed. */
  parentId: string | null;
  priority: Priority;
  /** Local date, YYYY-MM-DD. When the user plans to work on the task. */
  dueDate: string | null;
  /** Local time, HH:mm. Only meaningful with dueDate. */
  dueTime: string | null;
  /** Local date, YYYY-MM-DD. Hard external cutoff; never moves the task. */
  deadline: string | null;
  labels: string[]; // label names, lower-case
  /** Raw recurrence text, e.g. "every mon". Not yet expanded. */
  recurrence: string | null;
  /** Planned duration in minutes (calendar block height). */
  durationMin: number | null;
  /** Minutes before the due time to remind. Default [10]. */
  reminders: number[];
  /** Total seconds recorded by the task timer. */
  timeSpentSec: number;
  /** Epoch ms; set only while the timer is running. */
  timerStartedAt: number | null;
  completedAt: number | null;
  createdAt: number;
  order: number;
}

export interface Label {
  name: string; // unique, lower-case
  color: string;
}

export interface AppState {
  projects: Project[];
  sections: Section[];
  tasks: Task[];
  labels: Label[];
}

export const DEFAULT_REMINDERS = [10];

/** Project colors to pick from. Grey is the default when none is picked. */
export const PROJECT_COLORS: { name: string; value: string }[] = [
  { name: "Grey", value: "#94a3b8" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#eab308" },
  { name: "Green", value: "#22c55e" },
  { name: "Teal", value: "#14b8a6" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Indigo", value: "#6366f1" },
  { name: "Purple", value: "#a855f7" },
  { name: "Pink", value: "#ec4899" },
  { name: "Brown", value: "#a16207" },
];
export const DEFAULT_PROJECT_COLOR = PROJECT_COLORS[0].value;
/** The color every project got before colors could be picked. */
export const LEGACY_DEFAULT_COLOR = "#6366f1";
