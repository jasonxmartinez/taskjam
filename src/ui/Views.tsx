import { useState } from "react";
import { addSection, inboxTasks, localDate, placeTask, projectTasks, renameProject, setProjectColor, todayTasks } from "../model/db";
import type { Task } from "../model/types";
import { useStore } from "../store";
import { ColorDot, ColorPicker } from "./ColorPicker";
import { TASK_MIME } from "./ProjectSidebar";
import { TaskRow } from "./TaskRow";

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
  empty,
  target,
  dropAt,
  setDropAt,
}: {
  tasks: Task[];
  onOpen: (id: string) => void;
  empty?: string;
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
  const line = <div className="mx-2 h-0.5 rounded bg-accent" />;

  if (!tasks.length && !target) return empty ? <div className="px-2 py-3 text-sm text-ink-muted">{empty}</div> : null;
  return (
    <div onDragOver={(e) => over(e, tasks.length)} onDrop={dropped} className={target && dropAt ? "min-h-8 pb-1" : ""}>
      {tasks.map((t, i) => (
        <div
          key={t.id}
          draggable
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
          <TaskRow task={t} onOpen={onOpen} />
        </div>
      ))}
      {showAt === tasks.length && line}
      {!tasks.length && empty && showAt < 0 && <div className="px-2 py-2 text-sm text-ink-muted">{empty}</div>}
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

function ProjectTitle({ projectId }: { projectId: string }) {
  const { state, apply } = useStore();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const project = state.projects.find((p) => p.id === projectId)!;
  const parent = project.parentId ? state.projects.find((p) => p.id === project.parentId) : null;
  const save = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== project.name) setError(apply((s) => renameProject(s, projectId, draft)));
  };
  return (
    <div className="relative mb-2 px-2">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <button className="rounded-full p-1 hover:bg-surface-hover" title="Change color" aria-label="Change project color" onClick={() => setPicking(!picking)}>
          <ColorDot color={project.color} className="h-3.5 w-3.5" />
        </button>
        {parent && <span className="text-ink-muted">{parent.name} /</span>}
        {editing ? (
          <input
            autoFocus
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
            className="min-w-0 flex-1 rounded border border-line bg-surface px-1"
          />
        ) : (
          <button
            className="group flex items-center gap-2 rounded px-1 text-left hover:bg-surface-hover"
            title="Click to rename"
            onClick={() => {
              setDraft(project.name);
              setEditing(true);
            }}
          >
            {project.name}
            <span className="text-sm font-normal text-ink-muted opacity-0 group-hover:opacity-100">✎</span>
          </button>
        )}
      </h1>
      {error && <div className="text-xs text-red-600">{error}</div>}
      {picking && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setPicking(false)} />
          <div className="absolute left-2 top-full z-30 mt-1 rounded-md border border-line bg-surface-raised p-2 shadow-lg">
            <ColorPicker
              value={project.color}
              onChange={(c) => {
                apply((s) => setProjectColor(s, projectId, c));
                setPicking(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectView({ projectId, onOpen }: { projectId: string; onOpen: (id: string) => void }) {
  const { state, apply } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<DropAt>(null);
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return null;
  const { unsectioned, sections } = projectTasks(state, projectId);
  const subprojects = state.projects.filter((p) => p.parentId === projectId && !p.archived).sort((a, b) => a.order - b.order);
  const dnd = { dropAt, setDropAt };

  return (
    <div onDragEnd={() => setDropAt(null)}>
      <ProjectTitle key={projectId} projectId={projectId} />
      <List tasks={unsectioned} onOpen={onOpen} target={{ projectId, sectionId: null }} {...dnd} />
      {sections.map(({ section, tasks }) => (
        <div key={section.id}>
          <H>
            {section.name} <span className="font-normal">{tasks.length}</span>
          </H>
          <List tasks={tasks} onOpen={onOpen} target={{ projectId, sectionId: section.id }} empty="Drag tasks here." {...dnd} />
        </div>
      ))}
      {subprojects.map((sp) => {
        const { unsectioned: u, sections: ss } = projectTasks(state, sp.id);
        return (
          <div key={sp.id}>
            <H>
              <span className="inline-flex items-center gap-2">
                <ColorDot color={sp.color} />
                {sp.name}
              </span>
            </H>
            <List tasks={u} onOpen={onOpen} target={{ projectId: sp.id, sectionId: null }} empty={ss.length ? undefined : "No tasks yet."} {...dnd} />
            {ss.map(({ section, tasks }) => (
              <div key={section.id} className="ml-4">
                <div className="px-2 pt-1 text-xs text-ink-muted">{section.name}</div>
                <List tasks={tasks} onOpen={onOpen} target={{ projectId: sp.id, sectionId: section.id }} {...dnd} />
              </div>
            ))}
          </div>
        );
      })}
      <div className="mt-6 flex gap-2 px-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add section (any name)"
          className="w-64 rounded border border-line bg-transparent p-1 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              setError(apply((s) => addSection(s, { name, projectId }).state));
              setName("");
            }
          }}
        />
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
