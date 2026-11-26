import { useEffect, useState } from "react";
import { addProject, inboxTasks, localDate, projectTree, todayTasks } from "./model/db";
import { INBOX_ID } from "./model/types";
import { useStore } from "./store";
import { CalendarView } from "./ui/CalendarView";
import { QuickAdd, type QuickAddDefaults } from "./ui/QuickAdd";
import { TaskDetail } from "./ui/TaskDetail";
import { InboxView, ProjectView, TodayView } from "./ui/Views";

type View = { kind: "inbox" } | { kind: "today" } | { kind: "calendar" } | { kind: "project"; id: string };

export function App() {
  const { state, apply } = useStore();
  const [view, setView] = useState<View>({ kind: "inbox" });
  const [quick, setQuick] = useState(false);
  const [quickDefaults, setQuickDefaults] = useState<QuickAddDefaults | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [newProject, setNewProject] = useState<{ parentId: string | null } | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

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
  const tree = projectTree(state);

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
        <button className={item(view.kind === "inbox")} onClick={() => setView({ kind: "inbox" })}>
          Inbox <span className="text-xs text-slate-500">{counts.inbox || ""}</span>
        </button>
        <button className={item(view.kind === "today")} onClick={() => setView({ kind: "today" })}>
          Today <span className="text-xs text-slate-500">{counts.today || ""}</span>
        </button>
        <button className={item(view.kind === "calendar")} onClick={() => setView({ kind: "calendar" })}>
          Calendar
        </button>
        <div className="flex items-center justify-between px-2 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Projects
          <button title="New project" onClick={() => setNewProject({ parentId: null })}>＋</button>
        </div>
        {tree.map(({ project, children }) => (
          <div key={project.id}>
            <div className="group flex items-center">
              <button className={item(view.kind === "project" && view.id === project.id)} onClick={() => setView({ kind: "project", id: project.id })}>
                {project.name}
              </button>
              <button className="px-1 text-slate-400 opacity-0 group-hover:opacity-100" title="New subproject" onClick={() => setNewProject({ parentId: project.id })}>＋</button>
            </div>
            {children.map((c) => (
              <button key={c.id} className={`${item(view.kind === "project" && view.id === c.id)} pl-6`} onClick={() => setView({ kind: "project", id: c.id })}>
                {c.name}
              </button>
            ))}
          </div>
        ))}
        {newProject && (
          <input
            autoFocus
            value={name}
            placeholder={newProject.parentId ? "Subproject name" : "Project name"}
            className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 text-sm dark:border-slate-700"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNewProject(null);
              if (e.key === "Enter" && name.trim()) {
                setError(apply((s) => addProject(s, { name, parentId: newProject.parentId }).state));
                setName("");
                setNewProject(null);
              }
            }}
          />
        )}
        {error && <div className="px-2 text-xs text-red-600">{error}</div>}
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
          {view.kind === "project" && <ProjectView projectId={view.id} onOpen={setOpen} />}
        </div>
      </main>
      {quick && <QuickAdd defaults={quickDefaults ?? defaults} onClose={() => { setQuick(false); setQuickDefaults(null); }} />}
      {open && <TaskDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
