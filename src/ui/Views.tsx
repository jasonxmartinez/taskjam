import { useState } from "react";
import { addSection, inboxTasks, localDate, projectTasks, todayTasks } from "../model/db";
import type { Task } from "../model/types";
import { useStore } from "../store";
import { TaskRow } from "./TaskRow";

function List({ tasks, onOpen, empty }: { tasks: Task[]; onOpen: (id: string) => void; empty?: string }) {
  if (!tasks.length) return empty ? <div className="px-2 py-3 text-sm text-slate-500">{empty}</div> : null;
  return (
    <div>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} onOpen={onOpen} />
      ))}
    </div>
  );
}

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-1 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
);

export function InboxView({ onOpen }: { onOpen: (id: string) => void }) {
  const { state } = useStore();
  return (
    <>
      <h1 className="mb-2 px-2 text-2xl font-semibold">Inbox</h1>
      <List tasks={inboxTasks(state)} onOpen={onOpen} empty="Inbox zero. Press Q to capture something." />
    </>
  );
}

export function TodayView({ onOpen }: { onOpen: (id: string) => void }) {
  const { state, apply } = useStore();
  const today = localDate(new Date());
  const { overdue, today: due } = todayTasks(state, today);
  return (
    <>
      <h1 className="mb-2 px-2 text-2xl font-semibold">Today</h1>
      {overdue.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <H>Overdue</H>
            <button
              className="px-2 text-xs text-indigo-600"
              onClick={() => apply((s) => ({ ...s, tasks: s.tasks.map((t) => (!t.completedAt && !t.parentId && t.dueDate && t.dueDate < today ? { ...t, dueDate: today } : t)) }))}
            >
              Reschedule all to today
            </button>
          </div>
          <List tasks={overdue} onOpen={onOpen} />
        </>
      )}
      <List tasks={due} onOpen={onOpen} empty={overdue.length ? undefined : "Nothing due today."} />
    </>
  );
}

export function ProjectView({ projectId, onOpen }: { projectId: string; onOpen: (id: string) => void }) {
  const { state, apply } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const parent = project.parentId ? state.projects.find((p) => p.id === project.parentId) : null;
  const { unsectioned, sections } = projectTasks(state, projectId);
  const subprojects = state.projects.filter((p) => p.parentId === projectId && !p.archived);

  return (
    <>
      <h1 className="mb-2 px-2 text-2xl font-semibold">
        {parent && <span className="text-slate-400">{parent.name} / </span>}
        {project.name}
      </h1>
      <List tasks={unsectioned} onOpen={onOpen} />
      {sections.map(({ section, tasks }) => (
        <div key={section.id}>
          <H>
            {section.name} <span className="font-normal">{tasks.length}</span>
          </H>
          <List tasks={tasks} onOpen={onOpen} />
        </div>
      ))}
      {subprojects.map((sp) => {
        const { unsectioned: u, sections: ss } = projectTasks(state, sp.id);
        const all = [...u, ...ss.flatMap((x) => x.tasks)];
        return (
          <div key={sp.id}>
            <H>{sp.name}</H>
            <List tasks={all} onOpen={onOpen} empty="No tasks yet." />
          </div>
        );
      })}
      <div className="mt-6 flex gap-2 px-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add section (any name)"
          className="w-64 rounded border border-slate-300 bg-transparent p-1 text-sm dark:border-slate-700"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              setError(apply((s) => addSection(s, { name, projectId }).state));
              setName("");
            }
          }}
        />
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </>
  );
}
