import { localDate } from "../model/db";
import type { Task } from "../model/types";

export const HOUR_PX = 48;
export const DEFAULT_BLOCK_MIN = 30;
export const SNAP_MIN = 15;

/** n consecutive local dates starting at `start` (YYYY-MM-DD). */
export function dayRange(start: string, n: number): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => localDate(new Date(y, m - 1, d + i)));
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

export const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const minutesToTime = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Pixel offset inside the hour grid to a time snapped to 15 minutes, clamped to the day. */
export function snapMinutes(y: number): number {
  const raw = (y / HOUR_PX) * 60;
  const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
  return Math.max(0, Math.min(24 * 60 - SNAP_MIN, snapped));
}

export interface Placed {
  task: Task;
  top: number; // minutes from midnight
  height: number; // minutes
  lane: number;
  lanes: number; // lanes in this overlap group
}

/** Lays out timed tasks side by side when they overlap. */
export function layoutTimed(tasks: Task[]): Placed[] {
  const items = tasks
    .filter((t) => t.dueTime)
    .map((task) => {
      const top = timeToMinutes(task.dueTime!);
      const height = Math.max(task.durationMin ?? DEFAULT_BLOCK_MIN, 20);
      return { task, top, height, end: Math.min(top + height, 24 * 60) };
    })
    .sort((a, b) => a.top - b.top || b.end - a.end);

  const placed: Placed[] = [];
  let group: { p: Placed; end: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.p.lane + 1));
    group.forEach((g) => (g.p.lanes = lanes));
    group = [];
  };

  for (const it of items) {
    if (it.top >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > it.top).map((g) => g.p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p: Placed = { task: it.task, top: it.top, height: it.height, lane, lanes: 1 };
    placed.push(p);
    group.push({ p, end: it.end });
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return placed;
}
