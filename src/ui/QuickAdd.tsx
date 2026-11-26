import { CircleHelp } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addProject, addSection, addTask, deleteTask, localDate } from "../model/db";
import { INBOX_ID, type AppState } from "../model/types";
import { applySuggestion, completeAt } from "../parser/autocomplete";
import { parseQuickAdd, toNewTask, type ParsedTask, type TokenType } from "../parser/quickAdd";
import { loadSettings } from "../settings";
import { useStore } from "../store";
import { Dot } from "./common";
import { breadcrumb, shortDay, tintFor } from "./format";

export interface QuickAddDefaults {
  projectId?: string;
  sectionId?: string | null;
  dueDate?: string;
  dueTime?: string;
}

/** Pastel fill per recognized token, as in the design system's quick add. */
const TINT: Record<TokenType, string> = {
  project: "var(--tint-purple)",
  section: "var(--tint-blue)",
  priority: "var(--tint-red)",
  label: "var(--tint-green)",
  due: "var(--tint-yellow)",
  deadline: "var(--tint-red)",
  recurrence: "var(--tint-orange)",
  duration: "var(--tint-grey)",
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
  ["Click a highlight", "Keep it as plain text"],
];

export function QuickAdd({ defaults, onClose, variant = "modal", closeOnSave = false }: { defaults: QuickAddDefaults; onClose: () => void; variant?: "modal" | "window"; closeOnSave?: boolean }) {
  const { state, apply } = useStore();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [off, setOff] = useState<Set<TokenType>>(new Set());
  const [toast, setToast] = useState<{ text: string; ids: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => () => void (toastTimer.current && clearTimeout(toastTimer.current)), []);

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
    const el = ref.current;
    if (el) {
      // The box grows with its text instead of scrolling, so the highlights stay lined up.
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
    if (pendingCaret.current === null) return;
    el?.setSelectionRange(pendingCaret.current, pendingCaret.current);
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

  /** Adds parsed tasks; returns the new ids, or null on error. */
  const addAll = (list: ParsedTask[]): string[] | null => {
    const ids: string[] = [];
    const err = apply((s) => {
      let next: AppState = s;
      for (const parsed of list) {
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
        const res = addTask(next, {
          ...fields,
          projectId,
          sectionId,
          dueDate: fields.dueDate ?? defaults.dueDate ?? null,
          dueTime: fields.dueDate ? fields.dueTime : (defaults.dueTime ?? null),
          reminders: [...loadSettings().defaultReminders],
        });
        next = res.state;
        ids.push(res.task.id);
      }
      return next;
    });
    if (err) {
      setError(err);
      return null;
    }
    return ids;
  };

  const showToast = (msg: string, ids: string[]) => {
    setToast({ text: msg, ids });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const reset = () => {
    setInput("", 0);
    setOff(new Set());
    setError(null);
    setDismissed(null);
  };

  const save = (p: ParsedTask = parsed) => {
    if (!p.title) return;
    const ids = addAll([p]);
    if (!ids) return;
    reset();
    if (closeOnSave) return onClose();
    // Read the saved task back from the store's latest state on the next render.
    const where = p.projectId || p.unresolvedProject || defaults.projectId ? null : "Inbox";
    showToast(where ?? "", ids);
  };

  // Paste several lines: each becomes its own task.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const lines = e.clipboardData.getData("text").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const ids = addAll(lines.map((l) => parseQuickAdd(l, state)).filter((p) => p.title));
    if (!ids) return;
    reset();
    showToast(`Added ${ids.length} tasks`, ids);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      e.stopPropagation();
      if (n) setDismissed(text);
      else if (help) setHelp(false);
      else onClose();
    }
  };

  // Toast text: where the last task went ("Added to School › Strategy, Tue").
  const toastText = (() => {
    if (!toast) return "";
    if (toast.ids.length > 1) return toast.text;
    const t = state.tasks.find((x) => x.id === toast.ids[0]);
    if (!t) return "Removed";
    const day = t.dueDate ? `, ${shortDay(t.dueDate, localDate(new Date()))}` : "";
    return `Added to ${breadcrumb(state, t).join(" › ")}${day}`;
  })();
  const undone = toast && toast.ids.every((id) => !state.tasks.some((t) => t.id === id));

  const tokenTint = (type: TokenType) =>
    type === "project" && parsed.projectId ? tintFor(state.projects.find((p) => p.id === parsed.projectId)?.color) : TINT[type];

  // The highlights are drawn in a copy of the text that sits exactly under (and over) the box.
  const mirror = (layer: "under" | "over") => {
    const parts: React.ReactNode[] = [];
    let pos = 0;
    for (const t of parsed.tokens) {
      if (t.start < pos) continue;
      parts.push(text.slice(pos, t.start));
      parts.push(
        layer === "under" ? (
          <span key={t.start} className="rounded-[5px] [box-decoration-break:clone]" style={{ background: tokenTint(t.type), boxShadow: `0 0 0 2px ${tokenTint(t.type)}` }}>
            {t.text}
          </span>
        ) : (
          <span
            key={t.start}
            title="Click to keep as plain text"
            className="pointer-events-auto cursor-pointer rounded-[5px]"
            onMouseDown={(e) => {
              e.preventDefault();
              setOff((o) => new Set(o).add(t.type));
              ref.current?.focus();
            }}
          >
            {t.text}
          </span>
        ),
      );
      pos = t.end;
    }
    parts.push(text.slice(pos) + "\u200b");
    return (
      <div aria-hidden className={`pointer-events-none absolute inset-0 whitespace-pre-wrap break-words text-transparent ${layer === "over" ? "z-10" : ""}`}>
        {parts}
      </div>
    );
  };

  const box = (
    <div
      role="dialog"
      aria-label="Quick add"
      className={variant === "modal" ? "relative w-full max-w-[560px]" : "relative h-full p-3"}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && e.target !== ref.current) onClose();
      }}
    >
      <div className={`rounded-[16px] border border-line bg-surface-raised px-5 py-4 shadow-overlay ${variant === "window" ? "h-full" : ""}`}>
        <div className="flex items-start gap-3">
          <div className="relative min-w-0 flex-1 text-[18px] leading-[26px]">
            {mirror("under")}
            <textarea
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value.replace(/\r?\n/g, " "));
                setCaret(e.target.selectionStart ?? e.target.value.length);
              }}
              onSelect={syncCaret}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              placeholder="New task"
              aria-label="New task"
              aria-autocomplete="list"
              aria-expanded={!!completion}
              aria-controls="quick-add-suggestions"
              spellCheck={false}
              className="relative block w-full resize-none overflow-hidden whitespace-pre-wrap break-words border-0 bg-transparent p-0 text-[18px] leading-[26px] text-ink outline-none"
            />
            {mirror("over")}
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
            title="Syntax and keys"
            className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ${help ? "bg-accent text-accent-ink" : "text-ink-muted hover:text-ink"}`}
          >
            {help ? <span className="text-xs font-semibold">?</span> : <CircleHelp size={22} strokeWidth={1.25} aria-hidden />}
          </button>
        </div>
        {parsed.unresolvedProject && <div className="mt-2 text-xs text-ink-muted">New project “{parsed.unresolvedProject}” will be created</div>}
        {error && <div className="mt-2 text-xs text-danger">{error}</div>}
        {help && (
          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-line pt-3 text-xs sm:grid-cols-2">
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
      {completion && (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-[min(300px,100%)] -translate-x-1/2">
          <ul id="quick-add-suggestions" role="listbox" className="tj-pop max-h-72 overflow-y-auto p-1.5">
            {completion.items.map((item, i) => {
              const color = completion.kind === "project" ? state.projects.find((p) => p.id === item.key)?.color : null;
              return (
                <li
                  key={item.key}
                  role="option"
                  aria-selected={i === pick}
                  onMouseEnter={() => setPick(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    accept(i);
                  }}
                  className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-2.5 py-1.5 ${i === pick ? "bg-accent-soft" : ""}`}
                >
                  {color && <Dot color={color} />}
                  <span className="truncate">{item.label}</span>
                  {item.hint && <span className="ml-auto shrink-0 pl-3 text-xs text-ink-muted">{item.hint}</span>}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex justify-center gap-4 text-xs text-ink-muted">
            <span>
              <kbd className="tj-kbd">Tab</kbd> Pick
            </span>
            <span>
              <kbd className="tj-kbd">Enter</kbd> Save
            </span>
            <span>
              <kbd className="tj-kbd">Esc</kbd> Close
            </span>
          </div>
        </div>
      )}
      {toast && !completion && (
        <div role="status" className="tj-anim-pop mx-auto mt-3 flex w-[min(440px,100%)] items-center justify-between gap-4 rounded-[10px] bg-ink px-4 py-2.5 text-sm text-surface shadow-overlay">
          <span className="truncate">{undone ? "Removed" : toastText}</span>
          {!undone && (
            <button
              className="shrink-0 font-medium underline underline-offset-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                apply((s) => toast.ids.reduce((acc, id) => (acc.tasks.some((t) => t.id === id) ? deleteTask(acc, id) : acc), s));
                ref.current?.focus();
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );

  if (variant === "window") return <div className="h-screen bg-surface">{box}</div>;
  return (
    <div className="tj-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[18vh]" onClick={onClose}>
      {box}
    </div>
  );
}
