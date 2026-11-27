import { describe, expect, it } from "vitest";
import { addTask, emptyState } from "../model/db";
import { addDays, dayRange, dragStartMinutes, formatDuration, layoutTimed, minutesToTime, resizeDuration, snapMinutes } from "./layout";

const mk = (title: string, dueTime: string, durationMin: number | null = null) =>
  addTask(emptyState(), { title, dueDate: "2026-11-25", dueTime, durationMin }).task;

describe("calendar layout", () => {
  it("builds 3, 4 and 5 day ranges across a month end", () => {
    expect(dayRange("2026-11-29", 3)).toEqual(["2026-11-29", "2026-11-30", "2026-12-01"]);
    expect(dayRange("2026-11-25", 5)).toHaveLength(5);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-11-25", -1)).toBe("2026-11-24");
  });

  it("snaps drop positions to 15 minutes and clamps to the day", () => {
    expect(minutesToTime(snapMinutes(0))).toBe("00:00");
    expect(minutesToTime(snapMinutes(48 * 9 + 20))).toBe("09:30"); // 9:25 -> 9:30
    expect(minutesToTime(snapMinutes(48 * 100))).toBe("23:45");
    expect(snapMinutes(-50)).toBe(0);
  });

  it("moves a dragged block by its top edge, not by where it was grabbed", () => {
    // Grabbed 30 minutes below the top (24px) and released with the pointer at 10:00:
    // the block's top edge sits at 9:30, so that is the new start.
    expect(minutesToTime(dragStartMinutes(48 * 10 - 24, 60))).toBe("09:30");
    expect(minutesToTime(dragStartMinutes(48 * 9 + 5, 30))).toBe("09:00"); // 9:06 -> 9:00
    expect(dragStartMinutes(-100, 60)).toBe(0);
    // A 2-hour block can't start after 22:00, so its end stays on the calendar.
    expect(minutesToTime(dragStartMinutes(48 * 23.5, 120))).toBe("22:00");
    expect(minutesToTime(dragStartMinutes(48 * 30, 20))).toBe("23:30");
  });

  it("puts overlapping tasks in separate lanes and non-overlapping ones apart", () => {
    const placed = layoutTimed([mk("a", "09:00", 60), mk("b", "09:30", 60), mk("c", "11:00", 30)]);
    const by = Object.fromEntries(placed.map((p) => [p.task.title, p]));
    expect([by.a.lane, by.b.lane]).toEqual([0, 1]);
    expect(by.a.lanes).toBe(2);
    expect(by.c.lane).toBe(0);
    expect(by.c.lanes).toBe(1);
  });

  it("gives untimed-duration tasks a default block and skips tasks without a time", () => {
    const [p] = layoutTimed([mk("a", "08:00")]);
    expect(p.height).toBe(30);
    expect(layoutTimed([addTask(emptyState(), { title: "x", dueDate: "2026-11-25" }).task])).toEqual([]);
  });
});

describe("resizeDuration", () => {
  // HOUR_PX is 48, so 12px = 15 minutes.
  it("snaps to 15-minute steps", () => {
    expect(resizeDuration(9 * 60, 30, 12)).toBe(45);
    expect(resizeDuration(9 * 60, 30, 17)).toBe(45);
    expect(resizeDuration(9 * 60, 30, 19)).toBe(60);
    expect(resizeDuration(9 * 60, 30, 48)).toBe(90);
  });
  it("never goes below 15 minutes", () => {
    expect(resizeDuration(9 * 60, 30, -200)).toBe(15);
  });
  it("stops at midnight", () => {
    expect(resizeDuration(23 * 60, 30, 500)).toBe(60);
  });
  it("formats durations", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
  });
});
