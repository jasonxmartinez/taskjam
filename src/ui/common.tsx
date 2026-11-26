import { Check, Pause, Play } from "lucide-react";
import type { ReactNode } from "react";
import type { Task } from "../model/types";
import { PRIORITY_RING } from "./format";

/** Thin line icons: 16px, 1.75 stroke, as in the design system. */
export const ICON = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

/** Round complete checkbox: ring colored by priority, green check when done. */
export function Checkbox({ task, onToggle, size = 20 }: { task: Task; onToggle: () => void; size?: number }) {
  const done = !!task.completedAt;
  return (
    <button
      type="button"
      aria-label={done ? `Mark not done: ${task.title}` : `Complete: ${task.title}`}
      aria-pressed={done}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className="group/check flex shrink-0 items-center justify-center rounded-full p-0"
      style={{
        width: size,
        height: size,
        border: `1.5px solid ${done ? "var(--done)" : PRIORITY_RING[task.priority]}`,
        background: done ? "var(--done-soft)" : "transparent",
        color: "var(--done)",
      }}
    >
      {done ? (
        <Check size={12} strokeWidth={2} aria-hidden />
      ) : (
        <Check size={12} strokeWidth={2} aria-hidden className="opacity-0 group-hover/check:opacity-50" style={{ color: PRIORITY_RING[task.priority] }} />
      )}
    </button>
  );
}

export function Dot({ color, size = 9 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

/** Round play/pause button used on rows. */
export function TimerButton({ running, onClick, label, visible = true }: { running: boolean; onClick: () => void; label: string; visible?: boolean }) {
  return (
    <button
      type="button"
      aria-label={running ? `Pause timer: ${label}` : `Start timer: ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-hover ${running ? "text-done" : "text-ink"} ${visible ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"}`}
    >
      {running ? <Pause size={14} strokeWidth={1.75} aria-hidden /> : <Play size={14} strokeWidth={1.75} aria-hidden />}
    </button>
  );
}

/** Group header inside a view: "Overdue", "Assignments 2". */
export function GroupHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-6 flex min-h-7 items-center justify-between">
      <h2 className="tj-label m-0">{children}</h2>
      {action}
    </div>
  );
}

/** A view's serif title with an optional subtitle line. */
export function ViewTitle({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        {typeof title === "string" ? <h1 className="tj-display m-0">{title}</h1> : title}
        {children}
      </div>
      {subtitle && <div className="text-xs text-ink-muted">{subtitle}</div>}
    </div>
  );
}

/** Closes on outside click; used by menus and field popovers. */
export function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    />
  );
}
