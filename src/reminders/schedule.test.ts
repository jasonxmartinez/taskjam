import { describe, expect, it } from "vitest";
import { addTask, completeTask, emptyState } from "../model/db";
import { dueNow, remindersFor } from "./schedule";

const opts = { dateOnlyTime: "09:00" };
const local = (h: number, m = 0, d = 25) => new Date(2026, 10, d, h, m).getTime();

function one(input: Parameters<typeof addTask>[1]) {
  return addTask(emptyState(), input).task;
}

describe("reminders", () => {
  it("timed task gets a reminder 10 minutes before by default", () => {
    const t = one({ title: "Standup", dueDate: "2026-11-25", dueTime: "09:00" });
    const [r] = remindersFor([t], opts);
    expect(r.fireAt).toBe(local(8, 50));
    expect(r.body).toMatch(/Due in 10 min/);
  });

  it("supports several offsets, including at the due time", () => {
    const t = one({ title: "x", dueDate: "2026-11-25", dueTime: "14:00", reminders: [30, 0] });
    expect(remindersFor([t], opts).map((r) => r.fireAt)).toEqual([local(13, 30), local(14, 0)]);
  });

  it("date-only task reminds once at 9:00 that day", () => {
    const t = one({ title: "Pay rent", dueDate: "2026-11-25" });
    const rs = remindersFor([t], opts);
    expect(rs).toHaveLength(1);
    expect(rs[0].fireAt).toBe(local(9, 0));
  });

  it("no reminders for undated, completed, or reminder-less tasks", () => {
    const a = one({ title: "a" });
    const b = one({ title: "b", dueDate: "2026-11-25", dueTime: "10:00", reminders: [] });
    const done = addTask(emptyState(), { title: "c", dueDate: "2026-11-25", dueTime: "10:00" });
    const c = completeTask(done.state, done.task.id).tasks[0];
    expect(remindersFor([a, b, c], opts)).toEqual([]);
  });

  it("fires once: only when due, not expired, and not already fired", () => {
    const t = one({ title: "Standup", dueDate: "2026-11-25", dueTime: "09:00" });
    const rs = remindersFor([t], opts);
    expect(dueNow(rs, new Set(), local(8, 49))).toEqual([]);
    expect(dueNow(rs, new Set(), local(8, 50))).toHaveLength(1);
    expect(dueNow(rs, new Set([rs[0].key]), local(8, 55))).toEqual([]);
    expect(dueNow(rs, new Set(), local(9, 6))).toEqual([]); // 5 min after due: too late
  });

  it("changing the due time makes a new reminder key", () => {
    const t = one({ title: "x", dueDate: "2026-11-25", dueTime: "09:00" });
    const moved = { ...t, dueTime: "10:00" };
    expect(remindersFor([t], opts)[0].key).not.toBe(remindersFor([moved], opts)[0].key);
  });

  it("date-only reminder is still shown later that day, not the next", () => {
    const t = one({ title: "Pay rent", dueDate: "2026-11-25" });
    const rs = remindersFor([t], opts);
    expect(dueNow(rs, new Set(), local(15, 0))).toHaveLength(1);
    expect(dueNow(rs, new Set(), local(9, 0, 26))).toEqual([]);
  });
});
