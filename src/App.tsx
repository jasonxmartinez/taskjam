import { useEffect, useState } from "react";
import { elapsedSec, formatHMS, inboxTasks, localDate, placeTask, todayTasks } from "./model/db";
import { setTrayTitle } from "./platform";
import { useReminders } from "./reminders/useReminders";
import { loadSettings, saveSettings, type Settings } from "./settings";
import { SettingsDialog } from "./ui/Settings";
import { StatsView } from "./ui/StatsView";
import { INBOX_ID } from "./model/types";
import { useStore } from "./store";
import { CalendarView } from "./ui/CalendarView";
import { QuickAdd, type QuickAddDefaults } from "./ui/QuickAdd";
import { TaskDetail } from "./ui/TaskDetail";
import { ProjectSidebar, TASK_MIME } from "./ui/ProjectSidebar";
import { InboxView, ProjectView, TodayView } from "./ui/Views";

type View = { kind: "inbox" } | { kind: "today" } | { kind: "calendar" } | { kind: "stats" } | { kind: "project"; id: string };

export function App() {
  const { state, apply } = useStore();
  const [view, setView] = useState<View>({ kind: "inbox" });
  const [quick, setQuick] = useState(false);
  const [quickDefaults, setQuickDefaults] = useState<QuickAddDefaults | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [inboxOver, setInboxOver] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [, setGoogleVersion] = useState(0);
  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  useReminders(state, settings, setOpen);

  // Show the running timer in the Mac menu bar.
  useEffect(() => {
    const running = state.tasks.find((t) => t.timerStartedAt);
    if (!running) {
      void setTrayTitle("");
      return;
    }
    const tick = () => void setTrayTitle(`${formatHMS(elapsedSec(running))}`);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.tasks]);

  // Q opens quick add anywhere (unless typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "q") {
        e.preventDefault();
        setQuickDefaults(null);
        setQuick(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const today = localDate(new Date());
  const counts = { inbox: inboxTasks(state).length, today: (() => { const t = todayTasks(state, today); return t.overdue.length + t.today.length; })() };

  const item = (active: boolean) =>
    `flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${active ? "bg-slate-200 dark:bg-slate-800" : "hover:bg-slate-100 dark:hover:bg-slate-900"}`;

  const defaults: QuickAddDefaults =
    view.kind === "project"
      ? { projectId: view.id }
      : view.kind === "today"
        ? { dueDate: today }
        : view.kind === "calendar"
          ? { dueDate: today }
          : { projectId: INBOX_ID };

  return (
    <div className="flex h-screen">
      <aside className="w-64 shrink-0 space-y-1 overflow-y-auto border-r border-slate-200 p-3 dark:border-slate-800">
        <button className="mb-3 w-full rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white" onClick={() => { setQuickDefaults(null); setQuick(true); }}>
          + Add task <kbd className="ml-1 opacity-70">Q</kbd>
        </button>
        <button
          className={`${item(view.kind === "inbox")} ${inboxOver ? "bg-accent-soft" : ""}`}
          onClick={() => setView({ kind: "inbox" })}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(TASK_MIME)) return;
            e.preventDefault();
            setInboxOver(true);
          }}
          onDragLeave={() => setInboxOver(false)}
          onDrop={(e) => {
            setInboxOver(false);
            const id = e.dataTransfer.getData(TASK_MIME);
            if (id) apply((s) => placeTask(s, id, { projectId: INBOX_ID, sectionId: null, index: Number.MAX_SAFE_INTEGER }));
          }}
        >
          Inbox <span className="text-xs text-slate-500">{counts.inbox || ""}</span>
        </button>
        <button className={item(view.kind === "today")} onClick={() => setView({ kind: "today" })}>
          Today <span className="text-xs text-slate-500">{counts.today || ""}</span>
        </button>
        <button className={item(view.kind === "calendar")} onClick={() => setView({ kind: "calendar" })}>
          Calendar
        </button>
        <button className={item(view.kind === "stats")} onClick={() => setView({ kind: "stats" })}>
          Stats
        </button>
        <ProjectSidebar
          activeId={view.kind === "project" ? view.id : null}
          onSelect={(id) => setView({ kind: "project", id })}
          itemClass={item}
        />
        <button className="mt-4 w-full px-2 py-1 text-left text-xs text-slate-500" onClick={() => setShowSettings(true)}>⚙ Settings</button>
      </aside>
      <main className={`flex-1 ${view.kind === "calendar" ? "overflow-hidden p-6" : "overflow-y-auto p-8"}`}>
        <div className={view.kind === "calendar" ? "h-full" : "mx-auto max-w-3xl"}>
          {view.kind === "inbox" && <InboxView onOpen={setOpen} />}
          {view.kind === "today" && <TodayView onOpen={setOpen} />}
          {view.kind === "calendar" && (
            <CalendarView
              onOpen={setOpen}
              onQuickAdd={(d) => {
                setQuickDefaults(d);
                setQuick(true);
              }}
            />
          )}
          {view.kind === "stats" && <StatsView settings={settings} />}
          {view.kind === "project" && <ProjectView projectId={view.id} onOpen={setOpen} />}
        </div>
      </main>
      {quick && <QuickAdd defaults={quickDefaults ?? defaults} onClose={() => { setQuick(false); setQuickDefaults(null); }} />}
      {showSettings && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} onGoogleChange={() => setGoogleVersion((v) => v + 1)} />}
      {open && <TaskDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
