import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addDays, dayRange, DEFAULT_BLOCK_MIN, formatDuration, HOUR_PX, layoutBlocks, minutesToTime, resizeDuration, snapMinutes, timeToMinutes } from "../calendar/layout";
import { eventsForDay, type CalEvent } from "../google/events";
import { useGoogleEvents } from "../google/useGoogleEvents";
import { localDate, updateTask } from "../model/db";
import type { Task } from "../model/types";
import { useStore } from "../store";
import { ICON } from "./common";
import { fmtTime, timeRange, tintFor } from "./format";
import type { QuickAddDefaults } from "./QuickAdd";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
function EventChip({ event: e }: { event: CalEvent }) {
  return (
    <a
      href={e.link ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={`${e.title} (${e.calendarName})`}
      className="block truncate rounded-md border border-line-strong px-2 py-0.5 text-xs"
    >
      {e.title}
    </a>
  );
}

const hourLabel = (h: number) => (h === 0 ? "" : `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`);
const eventTime = (e: CalEvent) => {
  const t = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return timeRange(t(e.startMs), Math.round((e.endMs - e.startMs) / 60000));
};

export function CalendarView({ onOpen, onQuickAdd }: { onOpen: (id: string) => void; onQuickAdd: (d: QuickAddDefaults) => void }) {
  const { state, apply } = useStore();
  // Always opens on 3 days; the choice is deliberately not remembered.
  const [span, setSpan] = useState<3 | 4 | 5>(3);
  const today = localDate(new Date());
  const [start, setStart] = useState(today);
  const days = dayRange(start, span);
  const [showEvents, setShowEvents] = useState(() => {
    try {
      return localStorage.getItem("todojam.showGoogleEvents") !== "0";
    } catch {
      return true;
    }
  });
  const google = useGoogleEvents(days, showEvents);
  const toggleEvents = (on: boolean) => {
    setShowEvents(on);
    try {
      localStorage.setItem("todojam.showGoogleEvents", on ? "1" : "0");
    } catch {
      // ignore
    }
  };
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR_PX * 7 - 10;
  }, []);

  const [scrollbarW, setScrollbarW] = useState(0);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setScrollbarW(el.offsetWidth - el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const open = state.tasks.filter((t) => !t.completedAt && !t.parentId);
  const tint = (t: Task) => tintFor(state.projects.find((p) => p.id === t.projectId)?.color);
  const move = (id: string, date: string, time: string | null) =>
    apply((s) => updateTask(s, id, { dueDate: date, dueTime: time }));

  // Drag a task block's bottom edge to change its duration (15-minute steps).
  const [resizing, setResizing] = useState<{ id: string; durationMin: number } | null>(null);
  const resizeRef = useRef<{ id: string; durationMin: number } | null>(null);
  const justResized = useRef(false);
  const startResize = (e: React.PointerEvent, t: Task) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startMin = timeToMinutes(t.dueTime!);
    const startDur = t.durationMin ?? DEFAULT_BLOCK_MIN;
    resizeRef.current = { id: t.id, durationMin: startDur };
    setResizing(resizeRef.current);
    const onMove = (ev: PointerEvent) => {
      const durationMin = resizeDuration(startMin, startDur, ev.clientY - startY);
      if (durationMin !== resizeRef.current?.durationMin) {
        resizeRef.current = { id: t.id, durationMin };
        setResizing(resizeRef.current);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const done = resizeRef.current;
      resizeRef.current = null;
      setResizing(null);
      // The click that ends a resize must not open the task.
      justResized.current = true;
      setTimeout(() => (justResized.current = false), 0);
      if (done && done.durationMin !== startDur) apply((s) => updateTask(s, done.id, { durationMin: done.durationMin }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };
  const durationOf = (t: Task) => (resizing?.id === t.id ? resizing.durationMin : (t.durationMin ?? DEFAULT_BLOCK_MIN));

  const onDragStart = (e: React.DragEvent, t: Task) => {
    if (resizeRef.current) return e.preventDefault();
    e.dataTransfer.setData("text/task", t.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const allow = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const cols = { gridTemplateColumns: `3.5rem repeat(${span}, minmax(0, 1fr))` };
  // The hour grid scrolls and may show a scrollbar; pad the rows above by the same
  // width so the header, all-day row and hour grid share one set of column edges.
  const gutter = { paddingRight: scrollbarW };
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="tj-display m-0 mr-3">Calendar</h1>
        <button className="tj-btn tj-btn-secondary !h-8 !w-8 !p-0 !border-line" onClick={() => setStart(addDays(start, -1))} aria-label="Previous day">
          <ChevronLeft {...ICON} />
        </button>
        <button className="tj-btn tj-btn-secondary !h-8 !px-3 !border-line" onClick={() => setStart(today)}>
          Today
        </button>
        <button className="tj-btn tj-btn-secondary !h-8 !w-8 !p-0 !border-line" onClick={() => setStart(addDays(start, 1))} aria-label="Next day">
          <ChevronRight {...ICON} />
        </button>
        {google.connected && (
          <label className="ml-4 flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={showEvents} onChange={(e) => toggleEvents(e.target.checked)} />
            Google events
            {google.loading && <span className="text-xs text-ink-muted">…</span>}
          </label>
        )}
        <div className="ml-auto inline-flex gap-0.5 rounded-[10px] bg-surface-hover p-[3px]" role="group" aria-label="Days shown">
          {([3, 4, 5] as const).map((n) => (
            <button
              key={n}
              aria-pressed={span === n}
              onClick={() => setSpan(n)}
              className={`rounded-md px-3 py-1 ${span === n ? "bg-surface-raised font-medium text-ink shadow-raised" : "text-ink-muted"}`}
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      {google.error && (
        <div className="mb-2 rounded-md bg-tint-yellow px-3 py-1.5 text-xs">
          Google Calendar: {google.error}
        </div>
      )}
      <div className="grid border-b border-line" style={{ ...cols, ...gutter }}>
        <div />
        {days.map((d) => {
          const date = new Date(d + "T00:00:00");
          return (
            <div key={d} className="flex items-center justify-center gap-2 pb-2">
              <span className="text-xs text-ink-muted">{date.toLocaleDateString("en-US", { weekday: "short" })}</span>
              <span
                className={`flex h-9 min-w-9 items-center justify-center rounded-full font-serif text-[22px] font-light ${d === today ? "bg-accent text-accent-ink" : ""}`}
                aria-current={d === today ? "date" : undefined}
              >
                {date.getDate()}
              </span>
            </div>
          );
        })}
      </div>

      {/* Untimed tasks and deadlines */}
      <div className="grid border-b border-line" style={{ ...cols, ...gutter }}>
        <div className="py-1.5 pr-2 text-right text-xs text-ink-muted">All day</div>
        {days.map((d) => (
          <div
            key={d}
            className="min-h-12 space-y-1 border-l border-line p-1"
            onDragOver={allow}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/task");
              if (id) move(id, d, null);
            }}
          >
            {eventsForDay(google.events, d).allDay.map((e) => (
              <EventChip key={e.id} event={e} />
            ))}
            {open.filter((t) => t.dueDate === d && !t.dueTime).map((t) => (
              <button
                key={t.id}
                draggable
                onDragStart={(e) => onDragStart(e, t)}
                onClick={() => onOpen(t.id)}
                className="block w-full truncate rounded-md px-2 py-0.5 text-left text-xs"
                style={{ background: tint(t) }}
              >
                {t.title}
              </button>
            ))}
            {open.filter((t) => t.deadline === d && t.dueDate !== d).map((t) => (
              <button
                key={"dl" + t.id}
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-1 truncate rounded-md px-1 py-0.5 text-left text-xs text-danger"
                title="Deadline"
              >
                <Flag size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />
                <span className="truncate">{t.title} due</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Hour grid */}
      <div ref={scroller} className={`flex-1 overflow-y-auto ${resizing ? "cursor-ns-resize select-none" : ""}`}>
        <div className="relative grid" style={{ ...cols, height: HOUR_PX * 24 }}>
          <div>
            {HOURS.map((h) => (
              <div key={h} className="pr-2 text-right text-xs text-ink-muted" style={{ height: HOUR_PX }}>
                <span className="relative -top-2">{hourLabel(h)}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            type Item = { kind: "task"; task: Task } | { kind: "event"; event: CalEvent; startMin: number; endMin: number };
            const items: Item[] = [
              ...open
                .filter((t) => t.dueDate === d && t.dueTime)
                .map((task): Item => ({ kind: "task", task })),
              ...eventsForDay(google.events, d).timed.map((x): Item => ({ kind: "event", event: x.event, startMin: x.startMin, endMin: x.endMin })),
            ];
            const placed = layoutBlocks<Item>(
              items.map((item): { item: Item; top: number; height: number } =>
                item.kind === "task"
                  ? { item, top: timeToMinutes(item.task.dueTime!), height: Math.max(durationOf(item.task), 20) }
                  : { item, top: item.startMin, height: Math.max(item.endMin - item.startMin, 20) },
              ),
            );
            return (
              <div
                key={d}
                data-day={d}
                className="relative border-l border-line"
                onDragOver={allow}
                onDrop={(e) => {
                  const id = e.dataTransfer.getData("text/task");
                  if (!id) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  move(id, d, minutesToTime(snapMinutes(e.clientY - rect.top)));
                }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.slot) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  onQuickAdd({ dueDate: d, dueTime: minutesToTime(snapMinutes(e.clientY - rect.top)) });
                }}
              >
                {HOURS.map((h) => (
                  <div key={h} data-slot="1" className="border-t border-line" style={{ height: HOUR_PX }} />
                ))}
                {placed.map((p) => {
                  const pos = {
                    top: (p.top / 60) * HOUR_PX + 1,
                    height: (p.height / 60) * HOUR_PX - 3,
                    left: `calc(${(p.lane / p.lanes) * 100}% + 4px)`,
                    width: `calc(${100 / p.lanes}% - 8px)`,
                  };
                  if (p.item.kind === "event") {
                    const e = p.item.event;
                    return (
                      <a
                        key={e.id + d}
                        href={e.link ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        title={`${e.title} (${e.calendarName})`}
                        onClick={(ev) => ev.stopPropagation()}
                        className="absolute block overflow-hidden rounded-[10px] border border-line-strong bg-surface px-2.5 py-1 text-[13px] leading-[18px]"
                        style={pos}
                      >
                        <div className="truncate">{e.title}</div>
                        <div className="truncate text-[11px] leading-[14px] text-ink-muted">{eventTime(e)} · Google</div>
                      </a>
                    );
                  }
                  const task = p.item.task;
                  const active = resizing?.id === task.id;
                  return (
                    <button
                      key={task.id}
                      draggable={!active}
                      onDragStart={(ev) => onDragStart(ev, task)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        if (!justResized.current) onOpen(task.id);
                      }}
                      className={`group absolute overflow-hidden rounded-[10px] px-2.5 py-1 text-left text-[13px] leading-[18px] ${active ? "z-10 shadow-overlay ring-1 ring-accent" : ""}`}
                      style={{ ...pos, background: tint(task) }}
                      title={`${task.title}, ${formatDuration(durationOf(task))}`}
                    >
                      <div className="truncate">{task.title}</div>
                      <div className="truncate text-[11px] leading-[14px] text-ink-muted">
                        {task.durationMin || active ? timeRange(task.dueTime!, durationOf(task)) : fmtTime(task.dueTime!)}
                      </div>
                      <div
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={`Resize ${task.title}`}
                        title="Drag to change duration"
                        onPointerDown={(ev) => startResize(ev, task)}
                        onMouseDown={(ev) => ev.stopPropagation()}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                      >
                        <div className={`mx-auto mt-0.5 h-0.5 w-6 rounded bg-current ${active ? "opacity-60" : "opacity-0 group-hover:opacity-40"}`} />
                      </div>
                    </button>
                  );
                })}
                {d === today && (
                  <div className="pointer-events-none absolute left-0 right-0 z-20 border-t border-danger" style={{ top: (nowMin / 60) * HOUR_PX }}>
                    <span className="absolute -left-[5px] -top-[5px] h-[9px] w-[9px] rounded-full bg-danger" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
