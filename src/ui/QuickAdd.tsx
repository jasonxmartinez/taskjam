import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addProject, addSection, addTask } from "../model/db";
import { INBOX_ID, type AppState } from "../model/types";
import { applySuggestion, completeAt } from "../parser/autocomplete";
import { parseQuickAdd, toNewTask, type ParsedTask, type TokenType } from "../parser/quickAdd";
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

const HELP: [string, string][] = [
  ["#Project  #Parent/Sub", "Project"],
  ["/Section", "Section"],
  ["p1 – p4", "Priority"],
  ["@label", "Label"],
  ["tomorrow 3pm, fri, next mon", "Due date"],
  ["{fri}", "Deadline"],
  ["every mon", "Repeat"],
  ["30m, 1h30m, 1.5h, for 2 hours", "Duration"],
];
const KEYS: [string, string][] = [
  ["↑ ↓", "Move through suggestions"],
  ["Tab", "Pick suggestion"],
  ["Enter", "Save task (stays open)"],
  ["Esc", "Close suggestions, then close"],
];

export function QuickAdd({ defaults, onClose, variant = "modal", closeOnSave = false }: { defaults: QuickAddDefaults; onClose: () => void; variant?: "modal" | "window"; closeOnSave?: boolean }) {
  const { state, apply } = useStore();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [off, setOff] = useState<Set<TokenType>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const parsed = useMemo(() => parseQuickAdd(text, state, { disabled: off }), [text, state, off]);
  const completion = useMemo(
    () => (dismissed === text ? null : completeAt(text, caret, state, defaults.projectId)),
    [text, caret, state, defaults.projectId, dismissed],
  );
  const completionKey = completion ? `${completion.kind}:${completion.start}:${completion.items.map((i) => i.key).join(",")}` : "";
  useEffect(() => setPick(0), [completionKey]);

  // Put the caret back after a programmatic change, in the same frame the new text renders.
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingCaret.current === null) return;
    ref.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  }, [text]);
  const setInput = (next: string, at: number) => {
    pendingCaret.current = at;
    setText(next);
    setCaret(at);
  };
  const accept = (index = pick) => {
    if (!completion) return text;
    const out = applySuggestion(text, completion, completion.items[index]);
    setInput(out.text, out.caret);
    return out.text;
  };
  const syncCaret = () => setCaret(ref.current?.selectionStart ?? 0);

  const save = (p: ParsedTask = parsed) => {
    if (!p.title) return;
    const parsed = p;
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
    const where = state.projects.find((x) => x.id === (parsed.projectId ?? defaults.projectId))?.name ?? parsed.unresolvedProject ?? "Inbox";
    setToast(`Added to ${where}`);
    setInput("", 0);
    setOff(new Set());
    setError(null);
    setDismissed(null);
    setTimeout(() => setToast(null), 3000);
    if (closeOnSave) onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const n = completion?.items.length ?? 0;
    if (n && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setPick((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (n && e.key === "Tab") {
      e.preventDefault();
      accept();
    } else if (e.key === "Enter") {
      e.preventDefault();
      // Save with the highlighted project/section/label, not a guess from the partial text.
      // Priorities are left alone so a stray "p" never turns into p1.
      if (n && completion!.kind !== "priority") save(parseQuickAdd(accept(), state, { disabled: off }));
      else save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (n) setDismissed(text);
      else if (help) setHelp(false);
      else onClose();
    }
  };

  return (
    <div className={variant === "modal" ? "fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-32" : "h-screen"} onClick={variant === "modal" ? onClose : undefined}>
      <div className={variant === "modal" ? "relative w-full max-w-xl rounded-lg bg-surface-raised p-4 text-ink shadow-xl" : "relative h-full bg-surface-raised p-4 text-ink"} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape" && e.target !== ref.current) onClose();
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={ref}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={syncCaret}
              onKeyDown={onKeyDown}
              placeholder="New task"
              aria-label="New task"
              aria-autocomplete="list"
              aria-expanded={!!completion}
              aria-controls="quick-add-suggestions"
              className="w-full bg-transparent text-lg outline-none placeholder:text-ink-muted"
            />
            {completion && (
              <ul
                id="quick-add-suggestions"
                role="listbox"
                className="absolute left-0 top-full z-10 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-line bg-surface-raised py-1 text-sm shadow-lg"
              >
                {completion.items.map((item, i) => (
                  <li
                    key={item.key}
                    role="option"
                    aria-selected={i === pick}
                    onMouseEnter={() => setPick(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      accept(i);
                    }}
                    className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 ${i === pick ? "bg-accent-soft text-accent-ink" : ""}`}
                  >
                    <span className="truncate">{item.label}</span>
                    {item.hint && <span className="shrink-0 text-xs text-ink-muted">{item.hint}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setHelp((h) => !h);
              ref.current?.focus();
            }}
            aria-label="Quick add help"
            aria-expanded={help}
            title="Shortcuts"
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${help ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-muted hover:bg-surface-hover"}`}
          >
            ?
          </button>
        </div>
        {parsed.tokens.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
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
            {parsed.unresolvedProject && <span className="text-ink-muted">New project “{parsed.unresolvedProject}” will be created</span>}
          </div>
        )}
        {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        {toast && <div className="mt-2 text-xs text-ink-muted">{toast}</div>}
        {help && (
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 border-t border-line pt-3 text-xs">
            {HELP.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <code className="text-ink">{k}</code>
                <span className="text-ink-muted">{v}</span>
              </div>
            ))}
            {KEYS.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-2">
                <kbd className="text-ink">{k}</kbd>
                <span className="text-ink-muted">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
