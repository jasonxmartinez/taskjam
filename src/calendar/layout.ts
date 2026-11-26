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

export interface Block<T> {
  item: T;
  top: number; // minutes from midnight
  height: number; // minutes
}

export interface Lane<T> extends Block<T> {
  lane: number;
  lanes: number; // lanes in this overlap group
}

/** Lays out blocks side by side when they overlap. */
export function layoutBlocks<T>(blocks: Block<T>[]): Lane<T>[] {
  const items = blocks
    .map((b) => ({ b, end: Math.min(b.top + b.height, 24 * 60) }))
    .sort((x, y) => x.b.top - y.b.top || y.end - x.end);

  const placed: Lane<T>[] = [];
  let group: { p: Lane<T>; end: number }[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.p.lane + 1));
    group.forEach((g) => (g.p.lanes = lanes));
    group = [];
  };

  for (const it of items) {
    if (it.b.top >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > it.b.top).map((g) => g.p.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    const p: Lane<T> = { ...it.b, lane, lanes: 1 };
    placed.push(p);
    group.push({ p, end: it.end });
    groupEnd = Math.max(groupEnd, it.end);
  }
  flush();
  return placed;
}

export interface Placed {
  task: Task;
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Tasks with a due time, as blocks (30 minutes unless a duration is set). */
export function layoutTimed(tasks: Task[]): Placed[] {
  return layoutBlocks(
    tasks
      .filter((t) => t.dueTime)
      .map((task) => ({ item: task, top: timeToMinutes(task.dueTime!), height: Math.max(task.durationMin ?? DEFAULT_BLOCK_MIN, 20) })),
  ).map(({ item, ...rest }) => ({ task: item, ...rest }));
}

/**
 * New duration while dragging a block's bottom edge: the starting duration plus the
 * drag distance, in 15-minute steps, at least 15 minutes, and never past midnight.
 */
export function resizeDuration(startMin: number, startDurationMin: number, deltaPx: number): number {
  const raw = startDurationMin + (deltaPx / HOUR_PX) * 60;
  const snapped = Math.round(raw / SNAP_MIN) * SNAP_MIN;
  return Math.max(SNAP_MIN, Math.min(24 * 60 - startMin, snapped));
}

/** "1h 30m", "45m", "2h". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(" ") || "0m";
}
