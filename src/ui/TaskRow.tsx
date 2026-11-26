import { completeTask, elapsedSec, formatHMS, pauseTimer, startTimer, subtasksOf } from "../model/db";
import type { Task } from "../model/types";
import { useStore, useTick } from "../store";

const PRIORITY_COLOR: Record<number, string> = {
  1: "border-red-500",
  2: "border-orange-500",
  3: "border-yellow-500",
  4: "border-slate-400",
};

function fmtDate(d: string, t: string | null) {
  const date = new Date(d + "T00:00:00");
  const label = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return t ? `${label} ${t}` : label;
}

export function TaskRow({ task, onOpen, indent = false }: { task: Task; onOpen: (id: string) => void; indent?: boolean }) {
  const { state, apply } = useStore();
  const running = task.timerStartedAt !== null;
  useTick(running);
  const subs = subtasksOf(state, task.id);
  const spent = elapsedSec(task);

  return (
    <div className={indent ? "ml-8" : ""}>
      <div className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-900">
        <button
          aria-label="Complete task"
          onClick={() => apply((s) => completeTask(s, task.id))}
          className={`h-5 w-5 shrink-0 rounded-full border-2 ${PRIORITY_COLOR[task.priority]} hover:bg-slate-200 dark:hover:bg-slate-700`}
        />
        <button className="min-w-0 flex-1 text-left" onClick={() => onOpen(task.id)}>
          <div className="truncate">{task.title}</div>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            {task.dueDate && <span>{fmtDate(task.dueDate, task.dueTime)}</span>}
            {task.deadline && <span className="text-red-600 dark:text-red-400">⚑ {fmtDate(task.deadline, null)}</span>}
            {task.recurrence && <span>↻ {task.recurrence}</span>}
            {task.labels.map((l) => (
              <span key={l}>@{l}</span>
            ))}
            {subs.length > 0 && <span>{subs.filter((x) => x.completedAt).length}/{subs.length} subtasks</span>}
          </div>
        </button>
        {(spent > 0 || running) && (
          <span className={`font-mono text-xs tabular-nums ${running ? "text-emerald-600" : "text-slate-500"}`}>{formatHMS(spent)}</span>
        )}
        <button
          aria-label={running ? "Pause timer" : "Start timer"}
          onClick={() => apply((s) => (running ? pauseTimer(s, task.id) : startTimer(s, task.id)))}
          className={`rounded px-1.5 text-sm ${running ? "text-emerald-600" : "text-slate-400 opacity-0 group-hover:opacity-100"}`}
        >
          {running ? "⏸" : "▶"}
        </button>
      </div>
      {subs.filter((x) => !x.completedAt).map((sub) => (
        <TaskRow key={sub.id} task={sub} onOpen={onOpen} indent />
      ))}
    </div>
  );
}
