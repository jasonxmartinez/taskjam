import { Ellipsis, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { addSection, deadlinesSoon, doneToday, inboxTasks, localDate, placeTask, projectTasks, renameProject, setProjectColor, todayTasks, updateTask } from "../model/db";
import type { Priority, Task } from "../model/types";
import { useStore } from "../store";
import { ColorPicker } from "./ColorPicker";
import { Backdrop, Dot, GroupHeader, ICON, ViewTitle } from "./common";
import { longDate } from "./format";
import { TASK_MIME } from "./ProjectSidebar";
import { TaskRow, type RowContext } from "./TaskRow";

/** How a task detail opens: plain, with Move to showing, or with the Due field open. */
export type OpenMode = "move" | "due" | undefined;
export type OnOpen = (id: string, mode?: OpenMode) => void;

/** Where a dragged task lands in a project view. */
type Target = { projectId: string; sectionId: string | null };
type DropAt = { key: string; index: number } | null;
const keyOf = (t: Target) => `${t.projectId}:${t.sectionId ?? ""}`;

/**
 * A task list. Rows can always be dragged (onto a project in the sidebar, for example);
 * with `target`, the list also accepts drops and shows where the task will land.
 */
function List({
  tasks,
  onOpen,
  context,
  empty,
  selected,
  onHover,
  target,
  dropAt,
  setDropAt,
}: {
  tasks: Task[];
  onOpen: OnOpen;
  context: RowContext;
  empty?: string;
  selected?: string | null;
  onHover?: (id: string) => void;
  target?: Target;
  dropAt?: DropAt;
  setDropAt?: (d: DropAt) => void;
}) {
  const { apply } = useStore();
  const [dragging, setDragging] = useState<string | null>(null);
  const key = target ? keyOf(target) : "";
  const showAt = target && dropAt?.key === key ? dropAt.index : -1;
  const accepts = (e: React.DragEvent) => !!target && e.dataTransfer.types.includes(TASK_MIME);
  const over = (e: React.DragEvent, index: number) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (dropAt?.key !== key || dropAt.index !== index) setDropAt?.({ key, index });
  };
  const dropped = (e: React.DragEvent) => {
    if (!accepts(e)) return;
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(TASK_MIME);
    const index = showAt >= 0 ? showAt : tasks.length;
    setDropAt?.(null);
    if (!id || !target) return;
    // Indexes count the list as shown, including the dragged task itself.
    const from = tasks.findIndex((t) => t.id === id);
    apply((s) => placeTask(s, id, { ...target, index: from >= 0 && from < index ? index - 1 : index }));
  };
  const line = <div className="h-0.5 rounded bg-accent" />;

  if (!tasks.length && !target) return empty ? <div className="py-3 text-sm text-ink-muted">{empty}</div> : null;
  return (
    <div onDragOver={(e) => over(e, tasks.length)} onDrop={dropped} className={target && dropAt ? "min-h-8 pb-1" : ""}>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          draggable={!t.completedAt}
          onDragStart={(e) => {
            e.dataTransfer.setData(TASK_MIME, t.id);
            e.dataTransfer.effectAllowed = "move";
            setDragging(t.id);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropAt?.(null);
          }}
          onDragOver={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            over(e, e.clientY - r.top < r.height / 2 ? i : i + 1);
          }}
          className={dragging === t.id ? "opacity-40" : ""}
        >
          {showAt === i && line}
          <TaskRow task={t} onOpen={(id) => onOpen(id)} context={context} selected={selected === t.id} onHover={onHover} />
        </div>
      ))}
      {showAt === tasks.length && line}
      {!tasks.length && empty && showAt < 0 && <div className="py-2 text-sm text-ink-muted">{empty}</div>}
    </div>
  );
}

const isTyping = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement;
  return !!el.closest("input, textarea, select, [contenteditable]") || e.metaKey || e.ctrlKey || e.altKey;
};

export function InboxView({ onOpen, onAdd, paused }: { onOpen: OnOpen; onAdd: () => void; paused: boolean }) {
  const { state, apply } = useStore();
  const tasks = inboxTasks(state);
  const [selected, setSelected] = useState<string | null>(null);
  const current = tasks.find((t) => t.id === selected)?.id ?? tasks[0]?.id ?? null;

  // Triage keys: arrows pick a task, M moves it, T schedules it, 1 to 4 set priority.
  useEffect(() => {
    if (paused) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || !current) return;
      const k = e.key.toLowerCase();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = tasks.findIndex((t) => t.id === current);
        const next = tasks[Math.max(0, Math.min(tasks.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        setSelected(next.id);
      } else if (k === "m") {
        e.preventDefault();
        onOpen(current, "move");
      } else if (k === "t") {
        e.preventDefault();
        onOpen(current, "due");
      } else if (/^[1-4]$/.test(e.key)) {
        e.preventDefault();
        apply((s) => updateTask(s, current, { priority: Number(e.key) as Priority }));
      } else if (e.key === "Enter") {
        e.preventDefault();
        onOpen(current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, current, tasks, onOpen, apply]);

  return (
    <>
      <ViewTitle title="Inbox" subtitle={tasks.length ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} to sort, newest first` : "Nothing to sort"} />
      <div className="mt-5">
        <List tasks={tasks} onOpen={onOpen} context="inbox" selected={selected ? current : null} onHover={setSelected} empty="Inbox zero. Press Q to capture something." />
      </div>
      <AddTaskLine onClick={onAdd} />
      {tasks.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-4 text-xs text-ink-muted">
          <span>
            <kbd className="tj-kbd">M</kbd> Move
          </span>
          <span>
            <kbd className="tj-kbd">T</kbd> Schedule
          </span>
          <span>
            <kbd className="tj-kbd">1</kbd> to <kbd className="tj-kbd">4</kbd> Priority
          </span>
          <span>
            <kbd className="tj-kbd">↑</kbd> <kbd className="tj-kbd">↓</kbd> Select
          </span>
        </div>
      )}
    </>
  );
}

function AddTaskLine({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 flex h-8 items-center gap-2 rounded-md text-ink-muted hover:text-ink">
      <Plus {...ICON} />
      Add task
    </button>
  );
}

export function TodayView({ onOpen }: { onOpen: OnOpen }) {
  const { state, apply } = useStore();
  const today = localDate(new Date());
  const { overdue, today: due } = todayTasks(state, today);
  const finished = doneToday(state, today);
  const soon = deadlinesSoon(state, today);
  const todays = [...due, ...finished];
  return (
    <>
      <ViewTitle title="Today" subtitle={longDate(today)} />
      {overdue.length > 0 && (
        <>
          <GroupHeader
            action={
              <button
                className="tj-btn tj-btn-secondary tj-btn-sm"
                onClick={() => apply((s) => ({ ...s, tasks: s.tasks.map((t) => (!t.completedAt && !t.parentId && t.dueDate && t.dueDate < today ? { ...t, dueDate: today } : t)) }))}
              >
                Reschedule all to today
              </button>
            }
          >
            Overdue
          </GroupHeader>
          <List tasks={overdue} onOpen={onOpen} context="today" />
        </>
      )}
      <GroupHeader>Today</GroupHeader>
      <List tasks={todays} onOpen={onOpen} context="today" empty="Nothing due today. Press Q to plan something." />
      {soon.length > 0 && (
        <>
          <GroupHeader>Deadlines soon</GroupHeader>
          <List tasks={soon} onOpen={onOpen} context="deadlines" />
        </>
      )}
    </>
  );
}

function ProjectTitle({ projectId }: { projectId: string }) {
  const { state, apply } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<null | "menu" | "color">(null);
  const [error, setError] = useState<string | null>(null);
  const project = state.projects.find((p) => p.id === projectId)!;
  const parent = project.parentId ? state.projects.find((p) => p.id === project.parentId) : null;
  const startRename = () => {
    setDraft(project.name);
    setEditing(true);
    setMenu(null);
  };
  const save = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== project.name) setError(apply((s) => renameProject(s, projectId, draft)));
  };
  return (
    <div className="relative">
      {parent && <div className="text-xs text-ink-muted">{parent.name}</div>}
      <div className="flex items-center gap-3">
        <button className="rounded-full p-1 hover:bg-surface-hover" title="Change color" aria-label="Change project color" onClick={() => setMenu(menu === "color" ? null : "color")}>
          <Dot color={project.color} size={12} />
        </button>
        {editing ? (
          <input
            autoFocus
            aria-label="Project name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setDraft(project.name);
                setEditing(false);
              }
            }}
            className="tj-display min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2"
          />
        ) : (
          <h1 className="tj-display m-0 min-w-0 truncate">
            <button className="rounded-md px-1 text-left hover:bg-surface-hover" title="Click to rename" onClick={startRename}>
              {project.name}
            </button>
          </h1>
        )}
        <button
          aria-label="Project options"
          aria-expanded={menu === "menu"}
          onClick={() => setMenu(menu === "menu" ? null : "menu")}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-surface-hover"
        >
          <Ellipsis {...ICON} />
        </button>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
      {menu && (
        <>
          <Backdrop onClose={() => setMenu(null)} />
          <div className={`tj-pop tj-anim-pop absolute top-full z-40 mt-1 p-2 ${menu === "menu" ? "right-0 w-56" : "left-0"}`}>
            {menu === "menu" && (
              <button className="w-full rounded-md px-2 py-1.5 text-left hover:bg-surface-hover" onClick={startRename}>
                Rename
              </button>
            )}
            <div className="px-2 py-1">
              {menu === "menu" && <div className="mb-1.5 text-xs text-ink-muted">Color</div>}
              <ColorPicker
                value={project.color}
                onChange={(c) => {
                  apply((s) => setProjectColor(s, projectId, c));
                  setMenu(null);
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectView({ projectId, onOpen }: { projectId: string; onOpen: OnOpen }) {
  const { state, apply } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<DropAt>(null);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const { unsectioned, sections } = projectTasks(state, projectId);
  const subprojects = state.projects.filter((p) => p.parentId === projectId && !p.archived).sort((a, b) => a.order - b.order);
  const dnd = { dropAt, setDropAt, onOpen, context: "project" as const };

  return (
    <div onDragEnd={() => setDropAt(null)}>
      <ProjectTitle key={projectId} projectId={projectId} />
      <div className="mt-3">
        <List tasks={unsectioned} target={{ projectId, sectionId: null }} empty={sections.length || subprojects.length ? undefined : "No tasks yet. Press Q to add one."} {...dnd} />
      </div>
      {sections.map(({ section, tasks }) => (
        <div key={section.id}>
          <GroupHeader>
            {section.name} <span className="ml-1.5 font-normal">{tasks.length}</span>
          </GroupHeader>
          <List tasks={tasks} target={{ projectId, sectionId: section.id }} empty="Drag tasks here." {...dnd} />
        </div>
      ))}
      {subprojects.map((sp) => {
        const { unsectioned: u, sections: ss } = projectTasks(state, sp.id);
        return (
          <div key={sp.id}>
            <h2 className="tj-title mt-7 mb-0 flex items-center gap-2.5">
              <Dot color={sp.color} />
              {sp.name}
            </h2>
            <List tasks={u} target={{ projectId: sp.id, sectionId: null }} empty={ss.length ? undefined : "No tasks yet."} {...dnd} />
            {ss.map(({ section, tasks }) => (
              <div key={section.id}>
                <GroupHeader>
                  {section.name} <span className="ml-1.5 font-normal">{tasks.length}</span>
                </GroupHeader>
                <List tasks={tasks} target={{ projectId: sp.id, sectionId: section.id }} {...dnd} />
              </div>
            ))}
          </div>
        );
      })}
      <div className="mt-5 flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add section"
          aria-label="Add section"
          className="tj-input !w-60"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              setError(apply((s) => addSection(s, { name, projectId }).state));
              setName("");
            }
          }}
        />
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </div>
  );
}
