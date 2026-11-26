import { describe, expect, it } from "vitest";
import { deadlineLabel, dueLabel, fmtTime, shortDay, timeRange, tintFor } from "./format";
import type { Task } from "../model/types";

const today = "2026-11-26"; // a Thursday

describe("row labels", () => {
  it("names nearby days", () => {
    expect(shortDay("2026-11-26", today)).toBe("Today");
    expect(shortDay("2026-11-27", today)).toBe("Tomorrow");
    expect(shortDay("2026-11-25", today)).toBe("Yesterday");
    expect(shortDay("2026-11-30", today)).toBe("Mon");
    expect(shortDay("2026-11-24", today)).toBe("Tue");
    expect(shortDay("2026-12-10", today)).toBe("Dec 10");
    expect(shortDay("2027-01-10", today)).toBe("Jan 10, 2027");
  });

  it("formats times and ranges", () => {
    expect(fmtTime("13:05")).toBe("1:05 PM");
    expect(fmtTime("00:30")).toBe("12:30 AM");
    expect(timeRange("09:00", 75)).toBe("9:00 – 10:15 AM");
    expect(timeRange("11:00", 60)).toBe("11:00 AM – 12:00 PM");
  });

  it("shows only the time for today's tasks on Today", () => {
    const t = { dueDate: today, dueTime: "09:00" } as Task;
    expect(dueLabel(t, today, true)).toBe("9:00 AM");
    expect(dueLabel(t, today)).toBe("Today, 9:00 AM");
  });

  it("counts days to a deadline", () => {
    expect(deadlineLabel("2026-11-28", today)).toBe("Sat, 2 days left");
    expect(deadlineLabel("2026-11-27", today)).toBe("Fri, 1 day left");
    expect(deadlineLabel(today, today)).toBe("Today");
    expect(deadlineLabel("2026-11-23", today)).toBe("Mon, 3 days late");
  });

  it("picks a calendar tint from a project color", () => {
    expect(tintFor("#A855F7")).toBe("var(--tint-purple)");
    expect(tintFor("#123456")).toBe("var(--tint-grey)");
  });
});
