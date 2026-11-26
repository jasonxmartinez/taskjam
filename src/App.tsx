import { ChartNoAxesColumn, Calendar, Inbox, Plus, Settings as SettingsIcon, Sun } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { elapsedSec, formatHMS, inboxTasks, localDate, placeTask, todayTasks } from "./model/db";
import { isTauri, setLaunchAtLogin, setTrayTitle } from "./platform";
import { useReminders } from "./reminders/useReminders";
import { applyTheme, loadSettings, saveSettings, type Settings } from "./settings";
import { ICON } from "./ui/common";
import { SettingsDialog } from "./ui/Settings";
import { StatsView } from "./ui/StatsView";
import { INBOX_ID } from "./model/types";
import { useStore } from "./store";
import { CalendarView } from "./ui/CalendarView";
import { QuickAdd, type QuickAddDefaults } from "./ui/QuickAdd";
import { TaskDetail } from "./ui/TaskDetail";
import { ProjectSidebar, TASK_MIME } from "./ui/ProjectSidebar";
import { InboxView, ProjectView, TodayView, type OpenMode } from "./ui/Views";

type View = { kind: "inbox" } | { kind: "today" } | { kind: "calendar" } | { kind: "stats" } | { kind: "project"; id: string };

export function App() {
  const { state, apply } = useStore();
  const [view, setView] = useState<View>({ kind: "inbox" });
  const [quick, setQuick] = useState(false);
  const [quickDefaults, setQuickDefaults] = useState<QuickAddDefaults | null>(null);
  const [open, setOpenState] = useState<{ id: string; mode?: OpenMode } | null>(null);
  const openTask = useCallback((id: string, mode?: OpenMode) => setOpenState({ id, mode }), []);
  const setOpen = useCallback((id: string | null) => setOpenState(id ? { id } : null), []);
  const [inboxOver, setInboxOver] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [, setGoogleVersion] = useState(0);
  const updateSettings = (next: Settings) => {
    setSettings(next);
    saveSettings(next);
  };
  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  // Launch at login is on by default (it keeps reminders working); only set it once.
  useEffect(() => {
    if (!isTauri()) return;
    try {
      if (localStorage.getItem("todojam.autostart.init")) return;
      localStorage.setItem("todojam.autostart.init", "1");
    } catch {
      return;
    }
    void setLaunchAtLogin(true);
  }, []);
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
    `flex h-[34px] w-full items-center gap-2 rounded-[10px] px-3 text-left ${active ? "bg-[var(--nav-active)] font-medium shadow-raised" : "hover:bg-surface-hover"}`;

  const defaults: QuickAddDefaults =
    view.kind === "project"
      ? { projectId: view.id }
      : view.kind === "today"
        ? { dueDate: today }
        : view.kind === "calendar"
          ? { dueDate: today }
          : { projectId: INBOX_ID };
  const openQuick = (d: QuickAddDefaults | null = null) => {
    setQuickDefaults(d);
    setQuick(true);
  };

  const nav = (kind: "inbox" | "today" | "calendar" | "stats", label: string, icon: ReactNode, count?: number) => (
    <button className={item(view.kind === kind)} aria-current={view.kind === kind ? "page" : undefined} onClick={() => setView({ kind })}>
      {icon}
      <span>{label}</span>
      <span className="ml-auto text-xs font-normal text-ink-muted">{count || ""}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-surface text-ink">
      <aside className="flex w-60 shrink-0 flex-col bg-surface-sidebar p-4" aria-label="Main">
        <button className="tj-btn tj-btn-primary mb-3 w-full" onClick={() => openQuick()}>
          <Plus {...ICON} />
          Add task
          <span className="text-xs opacity-65">Q</span>
        </button>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <div
            className={`rounded-[10px] ${inboxOver ? "bg-accent-soft" : ""}`}
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
            {nav("inbox", "Inbox", <Inbox {...ICON} />, counts.inbox)}
          </div>
          {nav("today", "Today", <Sun {...ICON} />, counts.today)}
          {nav("calendar", "Calendar", <Calendar {...ICON} />)}
          {nav("stats", "Stats", <ChartNoAxesColumn {...ICON} />)}
          <ProjectSidebar activeId={view.kind === "project" ? view.id : null} onSelect={(id) => setView({ kind: "project", id })} itemClass={item} />
        </nav>
        <button className={`${item(showSettings)} mt-2`} onClick={() => setShowSettings(true)}>
          <SettingsIcon {...ICON} />
          Settings
        </button>
      </aside>
      <main className={`min-w-0 flex-1 ${view.kind === "calendar" ? "overflow-hidden px-6 pb-4 pt-6" : "overflow-y-auto px-8 py-10"}`}>
        <div className={view.kind === "calendar" ? "h-full" : "mx-auto max-w-[720px]"}>
          {view.kind === "inbox" && <InboxView onOpen={openTask} onAdd={() => openQuick({ projectId: INBOX_ID })} paused={!!open || quick || showSettings} />}
          {view.kind === "today" && <TodayView onOpen={openTask} />}
          {view.kind === "calendar" && <CalendarView onOpen={setOpen} onQuickAdd={(d) => openQuick(d)} />}
          {view.kind === "stats" && <StatsView settings={settings} />}
          {view.kind === "project" && <ProjectView projectId={view.id} onOpen={openTask} />}
        </div>
      </main>
      {quick && <QuickAdd defaults={quickDefaults ?? defaults} onClose={() => { setQuick(false); setQuickDefaults(null); }} />}
      {showSettings && <SettingsDialog settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} onGoogleChange={() => setGoogleVersion((v) => v + 1)} />}
      {open && <TaskDetail key={open.id} id={open.id} mode={open.mode} onClose={() => setOpen(null)} onOpen={(id) => setOpen(id)} />}
    </div>
  );
}
