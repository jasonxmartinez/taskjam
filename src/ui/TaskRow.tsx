import { Flag, Repeat } from "lucide-react";
import { completeTask, elapsedSec, formatHMS, localDate, pauseTimer, startTimer, subtasksOf, uncompleteTask } from "../model/db";
import { INBOX_ID, type Task } from "../model/types";
import { useStore, useTick } from "../store";
import { Checkbox, Dot, TimerButton } from "./common";
import { deadlineLabel, dueLabel, shortDay } from "./format";

export type RowContext = "today" | "inbox" | "project" | "deadlines";

export function TaskRow({
  task,
  onOpen,
  context,
  indent = false,
  selected = false,
  onHover,
}: {
  task: Task;
  onOpen: (id: string) => void;
  context: RowContext;
  indent?: boolean;
  selected?: boolean;
  onHover?: (id: string) => void;
}) {
  const { state, apply } = useStore();
  const running = task.timerStartedAt !== null;
  useTick(running);
  const today = localDate(new Date());
  const done = !!task.completedAt;
  const subs = subtasksOf(state, task.id);
  const spent = elapsedSec(task);
  const project = state.projects.find((p) => p.id === task.projectId);

  const due =
    context === "deadlines" && task.dueDate
      ? `Planned ${shortDay(task.dueDate, today)}`
      : dueLabel(task, today, context === "today");
  const overdue = !done && !!task.dueDate && task.dueDate < today;
  const showProject = context !== "project" && !task.parentId && project && project.id !== INBOX_ID;
  const doneSubs = subs.filter((x) => x.completedAt).length;

  return (
    <div>
      <div
        onMouseEnter={() => onHover?.(task.id)}
        onClick={() => onOpen(task.id)}
        className={`group flex cursor-default items-center gap-3 border-b border-line py-[11px] ${selected ? "-mx-2 rounded-md bg-accent-soft px-2" : ""}`}
        style={indent ? { marginLeft: 32 } : undefined}
        data-task-row={task.id}
      >
        <Checkbox task={task} onToggle={() => apply((s) => (done ? uncompleteTask(s, task.id) : completeTask(s, task.id)))} />
        <div className="min-w-0 flex-1">
          <div className={`truncate ${done ? "text-ink-muted line-through" : ""}`}>{task.title}</div>
          <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
            {due && <span className={overdue ? "text-danger" : ""}>{due}</span>}
            {task.deadline && !done && (
              <span className="inline-flex items-center gap-1 text-danger">
                <Flag size={12} strokeWidth={1.75} aria-hidden />
                <span className="sr-only">Deadline </span>
                {deadlineLabel(task.deadline, today)}
              </span>
            )}
            {task.recurrence && (
              <span className="inline-flex items-center gap-1">
                <Repeat size={12} strokeWidth={1.75} aria-hidden />
                {task.recurrence}
              </span>
            )}
            {task.labels.map((l) => (
              <span key={l}>@{l}</span>
            ))}
            {subs.length > 0 && (
              <span>
                {doneSubs} of {subs.length}
              </span>
            )}
            {showProject && (
              <span className="inline-flex items-center gap-1">
                <Dot color={project!.color} />
                {project!.name}
              </span>
            )}
          </div>
        </div>
        {(spent > 0 || running) && <span className={`text-xs tabular-nums ${running ? "text-done" : "text-ink-muted"}`}>{formatHMS(spent)}</span>}
        {!done && (
          <TimerButton
            running={running}
            label={task.title}
            visible={spent > 0 || running}
            onClick={() => apply((s) => (running ? pauseTimer(s, task.id) : startTimer(s, task.id)))}
          />
        )}
      </div>
      {!task.parentId &&
        subs
          .filter((x) => !x.completedAt)
          .map((sub) => <TaskRow key={sub.id} task={sub} onOpen={onOpen} context={context} indent onHover={onHover} />)}
    </div>
  );
}
