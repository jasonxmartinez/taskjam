import type { Task } from "../model/types";

export interface Reminder {
  /** Stable id so each reminder fires once: task + offset + the due value it was computed from. */
  key: string;
  taskId: string;
  title: string;
  body: string;
  /** Epoch ms when it should fire. */
  fireAt: number;
  /** Epoch ms after which it is no longer worth showing. */
  expiresAt: number;
}

const at = (date: string, time: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
};

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

export interface ReminderOptions {
  /** Local HH:mm for tasks with a date but no time. */
  dateOnlyTime: string;
  /** How long after the due time a reminder is still shown (ms). */
  graceMs?: number;
}

/**
 * Every reminder that could fire for open tasks.
 * - Timed task: one reminder per offset in `task.reminders`, N minutes before the due time.
 * - Date-only task: a single reminder at `dateOnlyTime` that day, if the task has any reminder at all.
 */
export function remindersFor(tasks: Task[], opts: ReminderOptions): Reminder[] {
  const grace = opts.graceMs ?? 5 * 60_000;
  const out: Reminder[] = [];
  for (const t of tasks) {
    if (t.completedAt || !t.dueDate || t.reminders.length === 0) continue;
    if (t.dueTime) {
      const due = at(t.dueDate, t.dueTime);
      for (const mins of new Set(t.reminders)) {
        out.push({
          key: `${t.id}|${mins}|${t.dueDate}T${t.dueTime}`,
          taskId: t.id,
          title: t.title,
          body: mins === 0 ? `Due now (${clock(t.dueTime)})` : `Due in ${mins} min (${clock(t.dueTime)})`,
          fireAt: due - mins * 60_000,
          expiresAt: due + grace,
        });
      }
    } else {
      const fireAt = at(t.dueDate, opts.dateOnlyTime);
      out.push({
        key: `${t.id}|day|${t.dueDate}`,
        taskId: t.id,
        title: t.title,
        body: "Due today",
        fireAt,
        // Still relevant for the rest of that day.
        expiresAt: at(t.dueDate, `${pad(23)}:${pad(59)}`),
      });
    }
  }
  return out;
}

/** Reminders that should be shown right now: time has come, not expired, not fired before. */
export function dueNow(reminders: Reminder[], fired: Set<string>, now: number): Reminder[] {
  return reminders.filter((r) => r.fireAt <= now && now <= r.expiresAt && !fired.has(r.key)).sort((a, b) => a.fireAt - b.fireAt);
}
