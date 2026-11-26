import { describe, expect, it } from "vitest";
import { eventsForDay, normalizeEvents, type RawCalendars } from "./events";

const raw: RawCalendars = {
  calendars: [
    {
      id: "me@gmail.com",
      summary: "Personal",
      color: "#16a765",
      events: [
        { id: "1", summary: "Dentist", start: { dateTime: "2026-11-25T14:00:00-08:00" }, end: { dateTime: "2026-11-25T15:00:00-08:00" } },
        { id: "2", summary: "Thanksgiving", start: { date: "2026-11-26" }, end: { date: "2026-11-27" } },
        { id: "3", summary: "Trip", start: { date: "2026-11-27" }, end: { date: "2026-11-30" } },
        { id: "4", summary: "Gone", status: "cancelled", start: { date: "2026-11-25" }, end: { date: "2026-11-26" } },
        { id: "5", summary: "Declined", start: { dateTime: "2026-11-25T10:00:00-08:00" }, end: { dateTime: "2026-11-25T11:00:00-08:00" }, attendees: [{ self: true, responseStatus: "declined" }] },
        { id: "6", start: { dateTime: "2026-11-25T22:00:00-08:00" }, end: { dateTime: "2026-11-26T02:00:00-08:00" } },
      ],
    },
  ],
};

describe("google events", () => {
  const events = normalizeEvents(raw);

  it("drops cancelled and declined events, names untitled ones", () => {
    expect(events.map((e) => e.title).sort()).toEqual(["(no title)", "Dentist", "Thanksgiving", "Trip"]);
  });

  it("one-day all-day event shows only on its day (end date is exclusive)", () => {
    expect(eventsForDay(events, "2026-11-26").allDay.map((e) => e.title)).toEqual(["Thanksgiving"]);
    expect(eventsForDay(events, "2026-11-27").allDay.map((e) => e.title)).toEqual(["Trip"]);
    expect(eventsForDay(events, "2026-11-25").allDay).toEqual([]);
  });

  it("multi-day all-day event covers each day up to the exclusive end", () => {
    for (const d of ["2026-11-27", "2026-11-28", "2026-11-29"]) expect(eventsForDay(events, d).allDay).toHaveLength(1);
    expect(eventsForDay(events, "2026-11-30").allDay).toEqual([]);
  });

  it("timed events carry colour and calendar name", () => {
    const [e] = events.filter((x) => x.title === "Dentist");
    expect([e.color, e.calendarName, e.allDay]).toEqual(["#16a765", "Personal", false]);
  });

  it("timed events past midnight are clipped to each day they touch", () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; // tests run in America/Los_Angeles
    expect(tz).toBe("America/Los_Angeles");
    const night = events.find((x) => x.title === "(no title)")!;
    const d25 = eventsForDay([night], "2026-11-25").timed[0];
    expect([d25.startMin, d25.endMin]).toEqual([22 * 60, 24 * 60]);
    const d26 = eventsForDay([night], "2026-11-26").timed[0];
    expect([d26.startMin, d26.endMin]).toEqual([0, 2 * 60]);
    expect(eventsForDay([night], "2026-11-27").timed).toEqual([]);
  });

  it("handles an empty or missing event list", () => {
    expect(normalizeEvents({ calendars: [{ id: "x", summary: "x", color: "#000", events: null }] })).toEqual([]);
  });
});
