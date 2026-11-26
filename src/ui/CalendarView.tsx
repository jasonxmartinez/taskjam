import { useEffect, useRef, useState } from "react";
import { addDays, dayRange, DEFAULT_BLOCK_MIN, HOUR_PX, layoutBlocks, minutesToTime, snapMinutes, timeToMinutes } from "../calendar/layout";
import { eventsForDay, type CalEvent } from "../google/events";
import { useGoogleEvents } from "../google/useGoogleEvents";
import { localDate, updateTask } from "../model/db";
import type { Task } from "../model/types";
import { useStore } from "../store";
import type { QuickAddDefaults } from "./QuickAdd";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const PRIORITY_BG: Record<number, string> = {
  1: "bg-red-100 border-red-500 text-red-900 dark:bg-red-950 dark:text-red-100",
  2: "bg-orange-100 border-orange-500 text-orange-900 dark:bg-orange-950 dark:text-orange-100",
  3: "bg-yellow-100 border-yellow-500 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100",
  4: "bg-indigo-100 border-indigo-500 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100",
};

function EventChip({ event: e }: { event: CalEvent }) {
  return (
    <a
      href={e.link ?? undefined}
      target="_blank"
      rel="noreferrer"
      title={`${e.title} (${e.calendarName})`}
      className="block truncate rounded border-l-4 px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-100"
      style={{ borderColor: e.color, backgroundColor: e.color + "33" }}
    >
      {e.title}
    </a>
  );
}

const hourLabel = (h: number) => (h === 0 ? "" : new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric" }));

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
    if (scroller.current) scroller.current.scrollTop = HOUR_PX * 7;
  }, []);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const open = state.tasks.filter((t) => !t.completedAt && !t.parentId);
  const move = (id: string, date: string, time: string | null) =>
    apply((s) => updateTask(s, id, { dueDate: date, dueTime: time }));

  const onDragStart = (e: React.DragEvent, t: Task) => {
    e.dataTransfer.setData("text/task", t.id);
    e.dataTransfer.effectAllowed = "move";
  };
  const allow = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const cols = { gridTemplateColumns: `3.5rem repeat(${span}, minmax(0, 1fr))` };
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center gap-2">
        <h1 className="mr-4 text-2xl font-semibold">Calendar</h1>
        <button className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700" onClick={() => setStart(addDays(start, -1))} aria-label="Previous day">←</button>
        <button className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700" onClick={() => setStart(today)}>Today</button>
        <button className="rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-700" onClick={() => setStart(addDays(start, 1))} aria-label="Next day">→</button>
        {google.connected && (
          <label className="ml-4 flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={showEvents} onChange={(e) => toggleEvents(e.target.checked)} />
            Google events
            {google.loading && <span className="text-xs text-slate-500">…</span>}
          </label>
        )}
        <div className="ml-auto inline-flex overflow-hidden rounded border border-slate-300 text-sm dark:border-slate-700" role="group" aria-label="Days shown">
          {([3, 4, 5] as const).map((n) => (
            <button
              key={n}
              aria-pressed={span === n}
              onClick={() => setSpan(n)}
              className={`px-3 py-1 ${span === n ? "bg-indigo-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-900"}`}
            >
              {n} day
            </button>
          ))}
        </div>
      </div>

      {google.error && (
        <div className="mb-2 rounded bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          Google Calendar: {google.error}
        </div>
      )}
      <div className="grid border-b border-slate-200 dark:border-slate-800" style={cols}>
        <div />
        {days.map((d) => {
          const date = new Date(d + "T00:00:00");
          return (
            <div key={d} className={`px-2 pb-1 text-center ${d === today ? "text-indigo-600" : ""}`}>
              <div className="text-xs uppercase text-slate-500">{date.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className="text-lg font-semibold">{date.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Untimed tasks and deadlines */}
      <div className="grid border-b border-slate-200 dark:border-slate-800" style={cols}>
        <div className="px-1 py-1 text-right text-[10px] text-slate-500">all day</div>
        {days.map((d) => (
          <div
            key={d}
            className="min-h-10 space-y-1 border-l border-slate-200 p-1 dark:border-slate-800"
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
                className={`block w-full truncate rounded border-l-4 px-1.5 py-0.5 text-left text-xs ${PRIORITY_BG[t.priority]}`}
              >
                {t.title}
              </button>
            ))}
            {open.filter((t) => t.deadline === d && t.dueDate !== d).map((t) => (
              <button
                key={"dl" + t.id}
                onClick={() => onOpen(t.id)}
                className="block w-full truncate rounded px-1.5 py-0.5 text-left text-xs text-red-700 dark:text-red-300"
                title="Deadline"
              >
                ⚑ {t.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Hour grid */}
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div className="relative grid" style={{ ...cols, height: HOUR_PX * 24 }}>
          <div>
            {HOURS.map((h) => (
              <div key={h} className="pr-1 text-right text-[10px] text-slate-500" style={{ height: HOUR_PX }}>
                <span className="relative -top-1.5">{hourLabel(h)}</span>
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
                  ? { item, top: timeToMinutes(item.task.dueTime!), height: Math.max(item.task.durationMin ?? DEFAULT_BLOCK_MIN, 20) }
                  : { item, top: item.startMin, height: Math.max(item.endMin - item.startMin, 20) },
              ),
            );
            return (
              <div
                key={d}
                data-day={d}
                className="relative border-l border-slate-200 dark:border-slate-800"
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
                  <div key={h} data-slot="1" className="border-t border-slate-100 dark:border-slate-900" style={{ height: HOUR_PX }} />
                ))}
                {placed.map((p) => {
                  const pos = {
                    top: (p.top / 60) * HOUR_PX,
                    height: (p.height / 60) * HOUR_PX - 1,
                    left: `${(p.lane / p.lanes) * 100}%`,
                    width: `calc(${100 / p.lanes}% - 2px)`,
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
                        className="absolute block overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-xs text-slate-800 dark:text-slate-100"
                        style={{ ...pos, borderColor: e.color, backgroundColor: e.color + "33" }}
                      >
                        <div className="truncate font-medium">{e.title}</div>
                      </a>
                    );
                  }
                  const task = p.item.task;
                  return (
                    <button
                      key={task.id}
                      draggable
                      onDragStart={(ev) => onDragStart(ev, task)}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onOpen(task.id);
                      }}
                      className={`absolute overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-left text-xs ${PRIORITY_BG[task.priority]}`}
                      style={pos}
                    >
                      <div className="truncate font-medium">{task.title}</div>
                      <div className="opacity-70">{task.dueTime}</div>
                    </button>
                  );
                })}
                {d === today && (
                  <div className="pointer-events-none absolute left-0 right-0 border-t-2 border-red-500" style={{ top: (nowMin / 60) * HOUR_PX }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
