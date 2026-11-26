/** Google Calendar events: normalising the API response and slicing it per day. */

export interface CalEvent {
  id: string;
  calendarId: string;
  calendarName: string;
  color: string;
  title: string;
  allDay: boolean;
  /** All-day: first date (YYYY-MM-DD). Timed: local date of the start. */
  startDate: string;
  /** All-day only: exclusive end date, as Google sends it. */
  endDate: string;
  /** Timed only: epoch ms. */
  startMs: number;
  endMs: number;
  link: string | null;
}

interface RawEvent {
  id?: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export interface RawCalendars {
  calendars: { id: string; summary: string; color: string; events: RawEvent[] | null }[];
}

const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function normalizeEvents(raw: RawCalendars): CalEvent[] {
  const out: CalEvent[] = [];
  for (const cal of raw.calendars ?? []) {
    for (const e of cal.events ?? []) {
      if (e.status === "cancelled" || !e.start || !e.end) continue;
      // Skip events you declined.
      if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) continue;
      const base = {
        id: `${cal.id}|${e.id ?? Math.random()}`,
        calendarId: cal.id,
        calendarName: cal.summary,
        color: cal.color,
        title: e.summary?.trim() || "(no title)",
        link: e.htmlLink ?? null,
      };
      if (e.start.date && e.end.date) {
        out.push({ ...base, allDay: true, startDate: e.start.date, endDate: e.end.date, startMs: 0, endMs: 0 });
      } else if (e.start.dateTime && e.end.dateTime) {
        const startMs = Date.parse(e.start.dateTime);
        const endMs = Date.parse(e.end.dateTime);
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
        out.push({ ...base, allDay: false, startDate: localDate(startMs), endDate: localDate(endMs), startMs, endMs });
      }
    }
  }
  return out;
}

export interface TimedSlice {
  event: CalEvent;
  /** Minutes from midnight on the day shown. */
  startMin: number;
  endMin: number;
}

const wallMinutes = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

/** What to draw on one local day (YYYY-MM-DD). */
export function eventsForDay(events: CalEvent[], date: string): { allDay: CalEvent[]; timed: TimedSlice[] } {
  const [y, m, d] = date.split("-").map(Number);
  const dayStart = new Date(y, m - 1, d).getTime();
  const dayEnd = new Date(y, m - 1, d + 1).getTime();
  const allDay: CalEvent[] = [];
  const timed: TimedSlice[] = [];
  for (const e of events) {
    if (e.allDay) {
      // endDate is exclusive: a one-day event on the 25th has endDate the 26th.
      if (e.startDate <= date && date < e.endDate) allDay.push(e);
    } else if (e.startMs < dayEnd && e.endMs > dayStart) {
      const startMin = e.startMs <= dayStart ? 0 : wallMinutes(e.startMs);
      const endMin = e.endMs >= dayEnd ? 24 * 60 : wallMinutes(e.endMs);
      timed.push({ event: e, startMin, endMin: Math.max(endMin, startMin + 15) });
    }
  }
  return { allDay, timed: timed.sort((a, b) => a.startMin - b.startMin) };
}
