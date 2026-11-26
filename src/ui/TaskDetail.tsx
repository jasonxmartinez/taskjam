import { useState } from "react";
import {
  addTask,
  completeTask,
  elapsedSec,
  formatHMS,
  parseHMS,
  pauseTimer,
  setTimeSpent,
  startTimer,
  subtasksOf,
  uncompleteTask,
  updateTask,
} from "../model/db";
import type { Priority } from "../model/types";
import { useStore, useTick } from "../store";

export function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, apply } = useStore();
  const task = state.tasks.find((t) => t.id === id);
  const [timeText, setTimeText] = useState<string | null>(null);
  const [sub, setSub] = useState("");
  const [error, setError] = useState<string | null>(null);
  useTick(!!task?.timerStartedAt);
  if (!task) return null;

  const running = task.timerStartedAt !== null;
  const project = state.projects.find((p) => p.id === task.projectId);
  const subs = subtasksOf(state, task.id);

  const saveTime = () => {
    if (timeText === null) return;
    const sec = parseHMS(timeText);
    if (sec === null) setError("Use h:mm:ss, mm:ss or seconds");
    else {
      setError(apply((s) => setTimeSpent(s, task.id, sec)));
      setTimeText(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <input
            className="w-full bg-transparent text-lg font-semibold outline-none"
            value={task.title}
            onChange={(e) => apply((s) => updateTask(s, task.id, { title: e.target.value }))}
          />
          <button onClick={onClose} aria-label="Close" className="text-slate-500">✕</button>
        </div>
        <div className="mb-4 text-sm text-slate-500">{project?.name}</div>

        <textarea
          placeholder="Notes: what is this about?"
          className="mb-4 h-28 w-full rounded border border-slate-300 bg-transparent p-2 text-sm dark:border-slate-700"
          value={task.notes}
          onChange={(e) => apply((s) => updateTask(s, task.id, { notes: e.target.value }))}
        />

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <label className="flex flex-col gap-1">
            Priority
            <select
              className="rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700"
              value={task.priority}
              onChange={(e) => apply((s) => updateTask(s, task.id, { priority: Number(e.target.value) as Priority }))}
            >
              <option value={1}>P1</option>
              <option value={2}>P2</option>
              <option value={3}>P3</option>
              <option value={4}>None</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Due date
            <input type="date" className="rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" value={task.dueDate ?? ""}
              onChange={(e) => apply((s) => updateTask(s, task.id, { dueDate: e.target.value || null }))} />
          </label>
          <label className="flex flex-col gap-1">
            Due time
            <input type="time" className="rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" value={task.dueTime ?? ""}
              onChange={(e) => apply((s) => updateTask(s, task.id, { dueTime: e.target.value || null }))} />
          </label>
          <label className="flex flex-col gap-1">
            Deadline
            <input type="date" className="rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" value={task.deadline ?? ""}
              onChange={(e) => apply((s) => updateTask(s, task.id, { deadline: e.target.value || null }))} />
          </label>
        </div>

        <div className="mb-5 rounded border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-sm font-medium">Timer</div>
          <div className="flex items-center gap-3">
            <button
              className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-40"
              disabled={!!task.completedAt}
              onClick={() => apply((s) => (running ? pauseTimer(s, task.id) : startTimer(s, task.id)))}
            >
              {running ? "⏸ Pause" : "▶ Start"}
            </button>
            {timeText === null ? (
              <button className="font-mono text-lg tabular-nums" title="Click to edit" onClick={() => setTimeText(formatHMS(elapsedSec(task)))}>
                {formatHMS(elapsedSec(task))}
              </button>
            ) : (
              <input
                autoFocus
                className="w-28 rounded border border-slate-300 bg-transparent p-1 font-mono dark:border-slate-700"
                value={timeText}
                onChange={(e) => setTimeText(e.target.value)}
                onBlur={saveTime}
                onKeyDown={(e) => e.key === "Enter" && saveTime()}
              />
            )}
          </div>
          {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
          <div className="mt-1 text-xs text-slate-500">Click the time to edit (h:mm:ss).</div>
        </div>

        {!task.parentId && (
          <div className="mb-5">
            <div className="mb-1 text-sm font-medium">Subtasks</div>
            {subs.map((st) => (
              <div key={st.id} className="flex items-center gap-2 py-0.5 text-sm">
                <button
                  className={`h-4 w-4 rounded-full border-2 ${st.completedAt ? "bg-slate-400" : ""} border-slate-400`}
                  onClick={() => apply((s) => (st.completedAt ? uncompleteTask(s, st.id) : completeTask(s, st.id)))}
                />
                <span className={st.completedAt ? "line-through text-slate-400" : ""}>{st.title}</span>
              </div>
            ))}
            <input
              placeholder="Add subtask, press Enter"
              className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 text-sm dark:border-slate-700"
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sub.trim()) {
                  apply((s) => addTask(s, { title: sub, parentId: task.id }).state);
                  setSub("");
                }
              }}
            />
          </div>
        )}

        <button
          className="text-sm text-slate-500 underline"
          onClick={() => apply((s) => (task.completedAt ? uncompleteTask(s, task.id) : completeTask(s, task.id)))}
        >
          {task.completedAt ? "Mark as not done" : "Mark complete (stops timer)"}
        </button>
      </div>
    </div>
  );
}
