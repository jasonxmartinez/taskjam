import { useRef, useState } from "react";
import { addProject, canNestProject, placeProject, placeTask, projectTree, renameProject, setProjectColor } from "../model/db";
import { DEFAULT_PROJECT_COLOR, type Project } from "../model/types";
import { useStore } from "../store";
import { ColorDot, ColorPicker } from "./ColorPicker";

export const TASK_MIME = "text/task";
const PROJECT_MIME = "text/project";

type Zone = "before" | "after" | "inside";
type Drop = { id: string; zone: Zone } | null;

/** Inline name field used for creating and renaming. */
function NameField({ initial, placeholder, onDone }: { initial: string; placeholder: string; onDone: (name: string | null) => void }) {
  const [name, setName] = useState(initial);
  const done = useRef(false);
  const finish = (value: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <input
      autoFocus
      value={name}
      placeholder={placeholder}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setName(e.target.value)}
      onBlur={() => finish(name.trim() ? name : null)}
      onKeyDown={(e) => {
        if (e.key === "Escape") finish(null);
        if (e.key === "Enter") finish(name.trim() ? name : null);
      }}
      className="w-full min-w-0 rounded border border-line bg-surface px-1 py-0.5 text-sm"
    />
  );
}

export function ProjectSidebar({
  activeId,
  onSelect,
  itemClass,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  itemClass: (active: boolean) => string;
}) {
  const { state, apply } = useStore();
  const tree = projectTree(state);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null; color: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const [taskOver, setTaskOver] = useState<string | null>(null);

  const run = (fn: Parameters<typeof apply>[0]) => setError(apply(fn));

  // ---- drag and drop ----
  const zoneFor = (e: React.DragEvent, p: Project): Zone | null => {
    if (!dragging || dragging === p.id) return null;
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    // Top-level rows: middle third nests the dragged project inside (when allowed).
    if (!p.parentId && y > 0.3 && y < 0.7 && canNestProject(state, dragging, p.id)) return "inside";
    const zone: Zone = y < 0.5 ? "before" : "after";
    return canNestProject(state, dragging, p.parentId) ? zone : null;
  };

  const onRowDragOver = (e: React.DragEvent, p: Project) => {
    if (e.dataTransfer.types.includes(TASK_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setTaskOver(p.id);
      return;
    }
    if (!e.dataTransfer.types.includes(PROJECT_MIME)) return;
    const zone = zoneFor(e, p);
    if (!zone) return setDrop(null);
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (drop?.id !== p.id || drop.zone !== zone) setDrop({ id: p.id, zone });
  };

  const onRowDrop = (e: React.DragEvent, p: Project) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData(TASK_MIME);
    setTaskOver(null);
    if (taskId) {
      run((s) => placeTask(s, taskId, { projectId: p.id, sectionId: null, index: Number.MAX_SAFE_INTEGER }));
      return;
    }
    const id = e.dataTransfer.getData(PROJECT_MIME) || dragging;
    const zone = drop?.id === p.id ? drop.zone : null;
    endDrag();
    if (!id || !zone) return;
    if (zone === "inside") {
      run((s) => placeProject(s, id, { parentId: p.id, index: Number.MAX_SAFE_INTEGER }));
      return;
    }
    run((s) => {
      const siblings = s.projects
        .filter((x) => x.parentId === p.parentId && !x.archived && x.id !== id && x.id !== "inbox")
        .sort((a, b) => a.order - b.order);
      const at = siblings.findIndex((x) => x.id === p.id);
      return placeProject(s, id, { parentId: p.parentId, index: at + (zone === "after" ? 1 : 0) });
    });
  };

  const endDrag = () => {
    setDragging(null);
    setDrop(null);
  };

  const indicator = (p: Project) =>
    drop?.id !== p.id
      ? taskOver === p.id
        ? "bg-accent-soft"
        : ""
      : drop.zone === "inside"
        ? "bg-accent-soft ring-1 ring-accent"
        : drop.zone === "before"
          ? "shadow-[inset_0_2px_0_var(--color-accent)]"
          : "shadow-[inset_0_-2px_0_var(--color-accent)]";

  // ---- rows ----
  const row = (p: Project, child: boolean) => {
    const active = activeId === p.id;
    return (
      <div
        key={p.id}
        className={`group relative flex items-center rounded ${indicator(p)} ${dragging === p.id ? "opacity-40" : ""}`}
        draggable={renaming !== p.id}
        onDragStart={(e) => {
          e.dataTransfer.setData(PROJECT_MIME, p.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(p.id);
          setMenu(null);
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => onRowDragOver(e, p)}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (drop?.id === p.id) setDrop(null);
          if (taskOver === p.id) setTaskOver(null);
        }}
        onDrop={(e) => onRowDrop(e, p)}
      >
        {renaming === p.id ? (
          <div className={`flex w-full items-center gap-2 py-0.5 ${child ? "pl-6" : "pl-2"} pr-1`}>
            <ColorDot color={p.color} />
            <NameField
              initial={p.name}
              placeholder="Project name"
              onDone={(name) => {
                setRenaming(null);
                if (name) run((s) => renameProject(s, p.id, name));
              }}
            />
          </div>
        ) : (
          <button
            className={`${itemClass(active)} ${child ? "pl-6" : ""} pr-12`}
            onClick={() => onSelect(p.id)}
            onDoubleClick={() => setRenaming(p.id)}
            title="Double-click to rename. Drag to reorder."
          >
            <span className="flex min-w-0 items-center gap-2">
              <ColorDot color={p.color} />
              <span className="truncate">{p.name}</span>
            </span>
          </button>
        )}
        {renaming !== p.id && (
          <div className="absolute right-1 flex items-center opacity-0 group-hover:opacity-100 focus-within:opacity-100">
            {!child && (
              <button className="px-1 text-ink-muted hover:text-ink" title="New subproject" onClick={() => setCreating({ parentId: p.id, color: DEFAULT_PROJECT_COLOR })}>
                ＋
              </button>
            )}
            <button className="px-1 text-ink-muted hover:text-ink" title="Edit project" aria-label={`Edit ${p.name}`} onClick={() => setMenu(menu === p.id ? null : p.id)}>
              ⋯
            </button>
          </div>
        )}
        {menu === p.id && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setMenu(null)} />
            <div className="absolute left-4 top-full z-30 mt-1 w-56 space-y-2 rounded-md border border-line bg-surface-raised p-2 shadow-lg">
              <button
                className="w-full rounded px-2 py-1 text-left text-sm hover:bg-surface-hover"
                onClick={() => {
                  setMenu(null);
                  setRenaming(p.id);
                }}
              >
                Rename
              </button>
              <div className="px-2">
                <div className="mb-1 text-xs text-ink-muted">Color</div>
                <ColorPicker value={p.color} onChange={(c) => run((s) => setProjectColor(s, p.id, c))} />
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const newField = (parentId: string | null) =>
    creating && creating.parentId === parentId ? (
      <div className={`mt-1 space-y-2 rounded border border-line bg-surface-raised p-2 ${parentId ? "ml-4" : ""}`}>
        <NameField
          initial=""
          placeholder={parentId ? "Subproject name" : "Project name"}
          onDone={(name) => {
            const color = creating.color;
            setCreating(null);
            if (name) run((s) => addProject(s, { name, parentId, color }).state);
          }}
        />
        <ColorPicker value={creating.color} onChange={(color) => setCreating({ ...creating, color })} />
        <div className="text-[11px] text-ink-muted">Enter to add, Esc to cancel</div>
      </div>
    ) : null;

  return (
    <>
      <div className="flex items-center justify-between px-2 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        Projects
        <button title="New project" onClick={() => setCreating({ parentId: null, color: DEFAULT_PROJECT_COLOR })}>
          ＋
        </button>
      </div>
      {tree.map(({ project, children }) => (
        <div key={project.id}>
          {row(project, false)}
          {children.map((c) => row(c, true))}
          {newField(project.id)}
        </div>
      ))}
      {newField(null)}
      {error && <div className="px-2 text-xs text-red-600">{error}</div>}
    </>
  );
}
