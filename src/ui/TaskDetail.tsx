import { Check, Ellipsis, FolderInput, Pause, Play, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDuration } from "../calendar/layout";
import {
  addTask,
  completeTask,
  deleteTask,
  elapsedSec,
  formatHMS,
  localDate,
  moveTask,
  parseDurationText,
  parseHMS,
  pauseTimer,
  projectTree,
  setTimeSpent,
  startTimer,
  subtasksOf,
  uncompleteTask,
  updateTask,
} from "../model/db";
import { INBOX_ID, type Priority, type Task } from "../model/types";
import { loadSettings } from "../settings";
import { useStore, useTick } from "../store";
import { Backdrop, Checkbox, Dot, ICON } from "./common";
import { breadcrumb, fmtTime, monthDay, PRIORITY_RING, shortDay } from "./format";
import type { OpenMode } from "./Views";

type Field = "due" | "deadline" | "priority" | "repeat" | "labels" | "reminders";

export function TaskDetail({ id, mode, onClose, onOpen }: { id: string; mode?: OpenMode; onClose: () => void; onOpen: (id: string) => void }) {
  const { state, apply } = useStore();
  const task = state.tasks.find((t) => t.id === id);
  const [field, setField] = useState<Field | null>(mode === "due" ? "due" : null);
  const [menu, setMenu] = useState<null | "menu" | "move">(mode === "move" ? "move" : null);
  const [error, setError] = useState<string | null>(null);
  useTick(!!task?.timerStartedAt);

  // Esc closes the innermost thing first: a field, then the menu, then the popup.
  const layers = useRef({ field, menu });
  layers.current = { field, menu };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (layers.current.field) setField(null);
      else if (layers.current.menu) setMenu(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const run = (fn: Parameters<typeof apply>[0]) => setError(apply(fn));
  const set = (patch: Partial<Task>) => run((s) => updateTask(s, task.id, patch));
  const project = state.projects.find((p) => p.id === task.projectId);
  const parent = task.parentId ? state.tasks.find((t) => t.id === task.parentId) : null;
  const subs = subtasksOf(state, task.id);
  const done = !!task.completedAt;
  const today = localDate(new Date());

  const chip = (f: Field, label: string, value: ReactNode, body: ReactNode, valueClass = "") => (
    <FieldChip key={f} label={label} value={value} valueClass={valueClass} open={field === f} onToggle={() => setField(field === f ? null : f)} onClose={() => setField(null)}>
      {body}
    </FieldChip>
  );

  return (
    <div className="tj-anim-fade fixed inset-0 z-40 flex items-start justify-center bg-scrim px-4 pt-[8vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={task.title}
        className="flex max-h-[86vh] w-full max-w-[640px] flex-col rounded-[16px] border border-line bg-surface-raised shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: where it lives, timer, more, close */}
        <div className="relative flex items-center gap-3 border-b border-line py-2.5 pl-4 pr-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 text-[13px]">
            {project && <Dot color={project.id === INBOX_ID ? "var(--line-strong)" : project.color} />}
            <span className="truncate">{breadcrumb(state, task).join(" › ")}</span>
            {parent && (
              <button className="truncate text-ink-muted hover:text-ink hover:underline" onClick={() => onOpen(parent.id)}>
                › {parent.title}
              </button>
            )}
          </div>
          <TimerPill task={task} onError={setError} />
          <button
            aria-label="More actions"
            aria-expanded={!!menu}
            onClick={() => setMenu(menu ? null : "menu")}
            className={`flex h-8 w-8 items-center justify-center rounded-[10px] border text-ink-muted hover:bg-surface-hover ${menu ? "border-line-strong" : "border-transparent"}`}
          >
            <Ellipsis {...ICON} />
          </button>
          <button aria-label="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-ink-muted hover:bg-surface-hover">
            <X {...ICON} />
          </button>
          {menu && (
            <>
              <Backdrop onClose={() => setMenu(null)} />
              <MoreMenu
                key={menu}
                mode={menu}
                task={task}
                onMove={() => setMenu("move")}
                onDelete={() => {
                  onClose();
                  apply((s) => deleteTask(s, task.id));
                }}
                onDone={() => setMenu(null)}
              />
            </>
          )}
        </div>

        <div className="overflow-y-auto px-6 pb-5 pt-5">
          {/* Title */}
          <div className="flex items-center gap-3">
            <Checkbox task={task} size={22} onToggle={() => run((s) => (done ? uncompleteTask(s, task.id) : completeTask(s, task.id)))} />
            <input
              aria-label="Title"
              value={task.title}
              onChange={(e) => set({ title: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && set({ title: "Untitled" })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={`tj-title min-w-0 flex-1 rounded-md bg-transparent px-1 outline-none focus:bg-surface-hover ${done ? "text-ink-muted line-through" : ""}`}
            />
          </div>

          {/* Fields */}
          <div className="mt-4 flex flex-wrap gap-2">
            {chip(
              "due",
              "Due",
              task.dueDate ? `${shortDay(task.dueDate, today)}${task.dueTime ? `, ${fmtTime(task.dueTime)}` : ""}` : "None",
              <DueEditor task={task} set={set} />,
              task.dueDate && task.dueDate < today && !done ? "text-danger" : "",
            )}
            {chip(
              "deadline",
              "Deadline",
              task.deadline ? new Date(task.deadline + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "None",
              <DeadlineEditor task={task} set={set} />,
              task.deadline ? "text-danger" : "",
            )}
            {chip(
              "priority",
              "Priority",
              <span className="inline-flex items-center gap-1.5">
                {task.priority < 4 && <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ border: `1.5px solid ${PRIORITY_RING[task.priority]}` }} />}
                {task.priority < 4 ? `P${task.priority}` : "None"}
              </span>,
              <PriorityEditor task={task} set={(p) => (set({ priority: p }), setField(null))} />,
            )}
            {chip("repeat", "Repeat", task.recurrence ?? "Never", <RepeatEditor task={task} set={set} />)}
            {chip("labels", "Labels", task.labels.length ? task.labels.map((l) => `@${l}`).join(" ") : "None", <LabelsEditor task={task} set={set} />)}
            {chip("reminders", "Reminders", task.reminders.length || "None", <RemindersEditor task={task} set={set} />)}
          </div>

          {/* Notes */}
          <label className="mt-5 block">
            <span className="tj-label">Notes</span>
            <textarea
              value={task.notes}
              placeholder="Add notes"
              onChange={(e) => set({ notes: e.target.value })}
              className="mt-1.5 block min-h-20 w-full resize-y rounded-[10px] border border-line bg-surface px-3 py-2.5 text-sm leading-5 outline-none focus:border-line-strong"
            />
          </label>

          {/* Subtasks */}
          {!task.parentId && <Subtasks task={task} subs={subs} onOpen={onOpen} />}
          {error && <div className="mt-3 text-xs text-danger">{error}</div>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-4 py-3">
          <span className="text-xs text-ink-muted">
            Added {monthDay(task.createdAt)}
            {done && ` · Completed ${monthDay(task.completedAt!)}`}
          </span>
          {done ? (
            <button className="tj-btn tj-btn-secondary" onClick={() => run((s) => uncompleteTask(s, task.id))}>
              Mark not done
            </button>
          ) : (
            <button
              className="tj-btn tj-btn-primary"
              onClick={() => {
                run((s) => completeTask(s, task.id));
                onClose();
              }}
            >
              Mark complete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "0:45:00 / 2h" with play/pause. Click the time or the plan to edit them. */
function TimerPill({ task, onError }: { task: Task; onError: (e: string | null) => void }) {
  const { apply } = useStore();
  const [edit, setEdit] = useState<null | "spent" | "plan">(null);
  const [text, setText] = useState("");
  const running = task.timerStartedAt !== null;
  const spent = elapsedSec(task);
  const save = () => {
    if (edit === "spent") {
      const sec = parseHMS(text);
      if (sec === null) return onError("Time spent: use h:mm:ss, like 0:45:00");
      onError(apply((s) => setTimeSpent(s, task.id, sec)));
    } else if (edit === "plan") {
      const min = text.trim() ? parseDurationText(text) : null;
      if (text.trim() && min === null) return onError("Planned time: try 45m, 2h or 1h30m");
      onError(apply((s) => updateTask(s, task.id, { durationMin: min })));
    }
    setEdit(null);
  };
  const field = (
    <input
      autoFocus
      aria-label={edit === "spent" ? "Time spent, h:mm:ss" : "Planned time"}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.stopPropagation();
          setEdit(null);
        }
      }}
      className={`rounded-md bg-surface-hover px-1.5 outline-none ${edit === "spent" ? "w-24 font-serif text-xl font-light" : "w-16 text-xs"}`}
    />
  );
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line pl-3.5 pr-1">
      {edit === "spent" ? (
        field
      ) : (
        <button
          title="Edit time spent"
          onClick={() => {
            setText(formatHMS(spent));
            setEdit("spent");
          }}
          className={`font-serif text-xl font-light tabular-nums ${running ? "text-done" : ""}`}
        >
          {formatHMS(spent)}
        </button>
      )}
      {edit === "plan" ? (
        field
      ) : (
        <button
          title="Edit planned time"
          onClick={() => {
            setText(task.durationMin ? formatDuration(task.durationMin).replace(" ", "") : "");
            setEdit("plan");
          }}
          className="text-xs text-ink-muted hover:text-ink"
        >
          / {task.durationMin ? formatDuration(task.durationMin) : "plan"}
        </button>
      )}
      <button
        aria-label={running ? "Pause timer" : "Start timer"}
        disabled={!!task.completedAt}
        onClick={() => onError(apply((s) => (running ? pauseTimer(s, task.id) : startTimer(s, task.id))))}
        className={`ml-1 flex h-[30px] w-[30px] items-center justify-center rounded-full disabled:opacity-40 ${running ? "bg-done text-surface" : "bg-accent text-accent-ink"}`}
      >
        {running ? <Pause size={14} strokeWidth={2} aria-hidden /> : <Play size={14} strokeWidth={2} aria-hidden />}
      </button>
    </div>
  );
}

/** The ⋯ menu. "Move to" turns it into a project and section picker in place. */
function MoreMenu({ mode, task, onMove, onDelete, onDone }: { mode: "menu" | "move"; task: Task; onMove: () => void; onDelete: () => void; onDone: () => void }) {
  const [confirm, setConfirm] = useState(false);
  if (mode === "move") return <MovePicker task={task} onDone={onDone} />;
  return (
    <div role="menu" className="tj-pop tj-anim-pop absolute right-12 top-full z-40 mt-1 w-52 p-1.5">
      <button role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left hover:bg-surface-hover" onClick={onMove}>
        <FolderInput {...ICON} className="text-ink-muted" />
        Move to…
        <kbd className="tj-kbd ml-auto">M</kbd>
      </button>
      <button
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-danger hover:bg-surface-hover"
        onClick={() => (confirm ? onDelete() : setConfirm(true))}
      >
        <Trash2 {...ICON} />
        {confirm ? "Click again to delete" : "Delete task"}
      </button>
    </div>
  );
}

function MovePicker({ task, onDone }: { task: Task; onDone: () => void }) {
  const { state, apply } = useStore();
  const [pick, setPick] = useState(task.projectId);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inbox = state.projects.find((p) => p.id === INBOX_ID)!;
  const rows = useMemo(() => {
    const all = [{ project: inbox, child: false, parent: "" }, ...projectTree(state).flatMap(({ project, children }) => [{ project, child: false, parent: "" }, ...children.map((c) => ({ project: c, child: true, parent: project.name }))])];
    const q = query.trim().toLowerCase();
    return q ? all.filter((r) => r.project.name.toLowerCase().includes(q) || r.parent.toLowerCase().includes(q)) : all;
  }, [state, inbox, query]);
  const sections = state.sections.filter((s) => s.projectId === pick).sort((a, b) => a.order - b.order);

  const move = (projectId: string, sectionId: string | null, close: boolean) => {
    const err = apply((s) => moveTask(s, task.id, { projectId, sectionId }));
    setError(err);
    if (!err && close) onDone();
  };
  const pickProject = (projectId: string) => {
    setPick(projectId);
    if (projectId !== task.projectId) move(projectId, null, !state.sections.some((s) => s.projectId === projectId));
  };

  const item = (active: boolean) => `flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left ${active ? "bg-accent-soft font-medium" : "hover:bg-surface-hover"}`;
  return (
    <div className="tj-pop tj-anim-pop absolute right-3 top-full z-40 mt-1 w-[min(480px,calc(100vw-48px))] overflow-hidden" role="dialog" aria-label="Move to">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <FolderInput {...ICON} className="text-ink-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && rows[0]) pickProject(rows[0].project.id);
          }}
          placeholder="Move to project"
          aria-label="Find a project"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </div>
      <div className="grid max-h-72 grid-cols-2">
        <div className="overflow-y-auto border-r border-line p-1.5">
          <div className="tj-label px-2.5 pb-1 pt-1">Project</div>
          {rows.map(({ project, child }) => (
            <button key={project.id} className={item(pick === project.id)} style={child ? { paddingLeft: 26 } : undefined} onClick={() => pickProject(project.id)}>
              <Dot color={project.id === INBOX_ID ? "var(--line-strong)" : project.color} />
              <span className="truncate">{project.name}</span>
              {task.projectId === project.id && <Check size={14} strokeWidth={2} className="ml-auto shrink-0 text-ink-muted" aria-label="Current" />}
            </button>
          ))}
          {!rows.length && <div className="px-2.5 py-1.5 text-ink-muted">No match</div>}
        </div>
        <div key={pick} className="tj-anim-fade overflow-y-auto p-1.5">
          <div className="tj-label px-2.5 pb-1 pt-1">Section</div>
          <button className={item(task.projectId === pick && !task.sectionId)} onClick={() => move(pick, null, true)}>
            No section
          </button>
          {sections.map((s) => (
            <button key={s.id} className={item(task.projectId === pick && task.sectionId === s.id)} onClick={() => move(pick, s.id, true)}>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
          {!sections.length && <div className="px-2.5 py-1.5 text-xs text-ink-muted">This project has no sections.</div>}
        </div>
      </div>
      {error && <div className="border-t border-line px-3 py-2 text-xs text-danger">{error}</div>}
    </div>
  );
}

function FieldChip({ label, value, valueClass, open, onToggle, onClose, children }: { label: string; value: ReactNode; valueClass: string; open: boolean; onToggle: () => void; onClose: () => void; children: ReactNode }) {
  return (
    <div className="relative">
      <button
        aria-expanded={open}
        onClick={onToggle}
        className={`flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] hover:bg-surface-hover ${open ? "border-line-strong" : "border-line"}`}
      >
        <span className="text-ink-muted">{label}</span>
        <span className={valueClass}>{value}</span>
      </button>
      {open && (
        <>
          <Backdrop onClose={onClose} />
          <div className="tj-pop tj-anim-pop absolute left-0 top-full z-40 mt-1 w-72 p-3" style={{ transformOrigin: "top left" }}>
            {children}
          </div>
        </>
      )}
    </div>
  );
}

type SetFn = (patch: Partial<Task>) => void;

const addDaysTo = (d: string, n: number) => {
  const [y, m, day] = d.split("-").map(Number);
  return localDate(new Date(y, m - 1, day + n));
};

function DueEditor({ task, set }: { task: Task; set: SetFn }) {
  const today = localDate(new Date());
  const nextMon = addDaysTo(today, ((8 - new Date().getDay()) % 7) || 7);
  const quick: [string, string | null][] = [
    ["Today", today],
    ["Tomorrow", addDaysTo(today, 1)],
    ["Next week", nextMon],
    ["No date", null],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {quick.map(([label, date]) => (
          <button key={label} className="tj-btn tj-btn-secondary tj-btn-sm" onClick={() => set({ dueDate: date, ...(date ? {} : { dueTime: null }) })}>
            {label}
          </button>
        ))}
      </div>
      <label className="block text-xs text-ink-muted">
        Date
        <input type="date" className="tj-input mt-1" value={task.dueDate ?? ""} onChange={(e) => set({ dueDate: e.target.value || null, ...(e.target.value ? {} : { dueTime: null }) })} />
      </label>
      <label className="block text-xs text-ink-muted">
        Time
        <input type="time" className="tj-input mt-1" disabled={!task.dueDate} value={task.dueTime ?? ""} onChange={(e) => set({ dueTime: e.target.value || null })} />
      </label>
    </div>
  );
}

function DeadlineEditor({ task, set }: { task: Task; set: SetFn }) {
  return (
    <div className="space-y-2">
      <label className="block text-xs text-ink-muted">
        Hard cutoff. It never moves the task.
        <input type="date" className="tj-input mt-1" value={task.deadline ?? ""} onChange={(e) => set({ deadline: e.target.value || null })} />
      </label>
      {task.deadline && (
        <button className="tj-btn tj-btn-sm" onClick={() => set({ deadline: null })}>
          Remove deadline
        </button>
      )}
    </div>
  );
}

function PriorityEditor({ task, set }: { task: Task; set: (p: Priority) => void }) {
  return (
    <div role="radiogroup" aria-label="Priority" className="space-y-0.5">
      {([1, 2, 3, 4] as Priority[]).map((p) => (
        <button key={p} role="radio" aria-checked={task.priority === p} onClick={() => set(p)} className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ${task.priority === p ? "bg-accent-soft font-medium" : "hover:bg-surface-hover"}`}>
          <span aria-hidden className="inline-block h-3.5 w-3.5 rounded-full" style={{ border: `1.5px solid ${PRIORITY_RING[p]}` }} />
          {p < 4 ? `P${p}` : "P4, no priority"}
        </button>
      ))}
    </div>
  );
}

function RepeatEditor({ task, set }: { task: Task; set: SetFn }) {
  const [text, setText] = useState(task.recurrence ?? "");
  const save = () => set({ recurrence: /^every!?\s+\S/i.test(text.trim()) ? text.trim() : null });
  return (
    <div className="space-y-2">
      <input
        autoFocus
        className="tj-input"
        placeholder="every mon"
        aria-label="Repeat"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      <div className="text-xs text-ink-muted">Like the quick add: every mon, every weekday, every! 2 weeks.</div>
      {task.recurrence && (
        <button
          className="tj-btn tj-btn-sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setText("");
            set({ recurrence: null });
          }}
        >
          Never repeat
        </button>
      )}
    </div>
  );
}

function LabelsEditor({ task, set }: { task: Task; set: SetFn }) {
  const { state, apply } = useStore();
  const [text, setText] = useState("");
  const names = [...new Set([...state.labels.map((l) => l.name), ...task.labels])].sort();
  const toggle = (n: string) => set({ labels: task.labels.includes(n) ? task.labels.filter((x) => x !== n) : [...task.labels, n] });
  return (
    <div className="space-y-2">
      <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
        {names.map((n) => (
          <button key={n} aria-pressed={task.labels.includes(n)} onClick={() => toggle(n)} className={`rounded-md px-2 py-0.5 text-xs ${task.labels.includes(n) ? "bg-accent text-accent-ink" : "bg-surface-hover"}`}>
            @{n}
          </button>
        ))}
        {!names.length && <span className="text-xs text-ink-muted">No labels yet.</span>}
      </div>
      <input
        className="tj-input"
        placeholder="New label, then Enter"
        aria-label="New label"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          const n = text.trim().replace(/^@/, "").toLowerCase();
          if (e.key === "Enter" && n && !/\s/.test(n)) {
            if (!task.labels.includes(n)) {
              apply((s) => ({
                ...s,
                labels: s.labels.some((l) => l.name === n) ? s.labels : [...s.labels, { name: n, color: "#94a3b8" }],
                tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, labels: [...t.labels, n] } : t)),
              }));
            }
            setText("");
          }
        }}
      />
    </div>
  );
}

function RemindersEditor({ task, set }: { task: Task; set: SetFn }) {
  const [text, setText] = useState("");
  const add = () => {
    const n = Number(text);
    if (text.trim() && Number.isFinite(n) && n >= 0 && !task.reminders.includes(n)) set({ reminders: [...task.reminders, Math.round(n)].sort((a, b) => b - a) });
    setText("");
  };
  return (
    <div className="space-y-2">
      {task.reminders.map((m) => (
        <div key={m} className="flex items-center justify-between rounded-md bg-surface-hover px-2.5 py-1">
          {m === 0 ? "At the due time" : `${m} min before`}
          <button aria-label="Remove reminder" className="text-ink-muted hover:text-ink" onClick={() => set({ reminders: task.reminders.filter((x) => x !== m) })}>
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input className="tj-input" inputMode="numeric" placeholder="Minutes before" aria-label="Minutes before" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="tj-btn tj-btn-secondary !h-[34px]" onClick={add}>
          Add
        </button>
      </div>
      <div className="text-xs text-ink-muted">
        {!task.dueDate
          ? "Set a due date for reminders to fire."
          : !task.dueTime
            ? `No time set, so one reminder at ${fmtTime(loadSettings().dateOnlyReminderTime)} that day.`
            : "0 means at the due time."}
      </div>
    </div>
  );
}

function Subtasks({ task, subs, onOpen }: { task: Task; subs: Task[]; onOpen: (id: string) => void }) {
  const { apply } = useStore();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const doneCount = subs.filter((s) => s.completedAt).length;
  return (
    <div className="mt-5">
      <div className="tj-label">
        Subtasks{subs.length > 0 && ` · ${doneCount} of ${subs.length}`}
      </div>
      <div className="mt-1">
        {subs.map((st) => (
          <div key={st.id} className="flex items-center gap-3 border-b border-line py-2">
            <Checkbox task={st} size={18} onToggle={() => apply((s) => (st.completedAt ? uncompleteTask(s, st.id) : completeTask(s, st.id)))} />
            <button className={`min-w-0 flex-1 truncate text-left ${st.completedAt ? "text-ink-muted line-through" : ""}`} onClick={() => onOpen(st.id)}>
              {st.title}
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <input
          autoFocus
          aria-label="New subtask"
          placeholder="Subtask name, then Enter"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => !text.trim() && setAdding(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && text.trim()) {
              apply((s) => addTask(s, { title: text, parentId: task.id, reminders: [...loadSettings().defaultReminders] }).state);
              setText("");
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setAdding(false);
            }
          }}
          className="mt-2 w-full rounded-md border border-line-strong bg-surface px-2.5 py-1.5 outline-none"
        />
      ) : (
        <button className="mt-2 flex items-center gap-1.5 px-1.5 text-xs text-ink-muted hover:text-ink" onClick={() => setAdding(true)}>
          <Plus size={14} strokeWidth={1.75} aria-hidden />
          Add subtask
        </button>
      )}
    </div>
  );
}
