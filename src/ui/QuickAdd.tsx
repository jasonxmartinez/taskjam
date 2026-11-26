import { useEffect, useMemo, useRef, useState } from "react";
import { addProject, addSection, addTask } from "../model/db";
import { INBOX_ID, type AppState } from "../model/types";
import { parseQuickAdd, toNewTask, type TokenType } from "../parser/quickAdd";
import { loadSettings } from "../settings";
import { useStore } from "../store";

export interface QuickAddDefaults {
  projectId?: string;
  sectionId?: string | null;
  dueDate?: string;
  dueTime?: string;
}

const CHIP: Record<TokenType, string> = {
  project: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  section: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  priority: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  label: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  due: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  deadline: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  recurrence: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  duration: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

export function QuickAdd({ defaults, onClose, variant = "modal", closeOnSave = false }: { defaults: QuickAddDefaults; onClose: () => void; variant?: "modal" | "window"; closeOnSave?: boolean }) {
  const { state, apply } = useStore();
  const [text, setText] = useState("");
  const [off, setOff] = useState<Set<TokenType>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const parsed = useMemo(() => parseQuickAdd(text, state, { disabled: off }), [text, state, off]);

  const save = () => {
    if (!parsed.title) return;
    const err = apply((s) => {
      let next: AppState = s;
      let projectId = parsed.projectId ?? defaults.projectId ?? INBOX_ID;
      let sectionId = parsed.projectId || !defaults.projectId ? parsed.sectionId : (defaults.sectionId ?? null);
      // Unknown names are created, not rejected.
      if (parsed.unresolvedProject) {
        const made = addProject(next, { name: parsed.unresolvedProject.split("/").pop()! });
        next = made.state;
        projectId = made.project.id;
      }
      if (parsed.unresolvedSection && projectId !== INBOX_ID) {
        const made = addSection(next, { name: parsed.unresolvedSection, projectId });
        next = made.state;
        sectionId = made.section.id;
      }
      const fields = toNewTask(parsed);
      return addTask(next, {
        ...fields,
        projectId,
        sectionId,
        dueDate: fields.dueDate ?? defaults.dueDate ?? null,
        dueTime: fields.dueDate ? fields.dueTime : (defaults.dueTime ?? null),
        reminders: [...loadSettings().defaultReminders],
      }).state;
    });
    if (err) return setError(err);
    const where = state.projects.find((p) => p.id === (parsed.projectId ?? defaults.projectId))?.name ?? parsed.unresolvedProject ?? "Inbox";
    setToast(`Added to ${where}`);
    setText("");
    setOff(new Set());
    setError(null);
    setTimeout(() => setToast(null), 3000);
    if (closeOnSave) onClose();
  };

  return (
    <div className={variant === "modal" ? "fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32" : "h-screen"} onClick={variant === "modal" ? onClose : undefined}>
      <div className={variant === "modal" ? "w-full max-w-xl rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900" : "h-full bg-white p-4 dark:bg-slate-900"} onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") onClose();
          }}
          placeholder='Case write-up #Strategy /Assignments tue 7pm {thu} p1 @label for 2h'
          className="w-full bg-transparent text-lg outline-none"
        />
        <div className="mt-3 flex min-h-6 flex-wrap gap-2 text-xs">
          {parsed.tokens.map((t) => (
            <button
              key={t.start}
              title="Click to treat as plain text"
              onClick={() => setOff((o) => new Set(o).add(t.type))}
              className={`rounded px-2 py-0.5 ${CHIP[t.type]}`}
            >
              {t.type === "due" && parsed.dueDate ? `${t.text} → ${parsed.dueDate}${parsed.dueTime ? " " + parsed.dueTime : ""}` : t.text}
            </button>
          ))}
          {parsed.unresolvedProject && <span className="text-slate-500">New project “{parsed.unresolvedProject}” will be created</span>}
        </div>
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        <div className="mt-3 text-xs text-slate-500">
          Enter saves and stays open · Esc closes ·{" "}
          {toast ?? "#project /section p1-p4 @label · dates · {deadline} · every… · for 30m"}
        </div>
      </div>
    </div>
  );
}
