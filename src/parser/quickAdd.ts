import * as chrono from "chrono-node";
import { INBOX_ID, type AppState, type Priority } from "../model/types";
import { localDate } from "../model/db";

export type TokenType = "project" | "section" | "priority" | "label" | "due" | "deadline" | "recurrence" | "duration";

export interface Token {
  type: TokenType;
  text: string; // exact text in the input, for highlighting
  start: number;
  end: number;
}

export interface ParsedTask {
  title: string;
  /** Resolved project id, or null when none was typed or it did not match. */
  projectId: string | null;
  /** Typed project text that matched nothing (offer "Create project ..."). */
  unresolvedProject: string | null;
  sectionId: string | null;
  unresolvedSection: string | null;
  priority: Priority | null;
  labels: string[];
  dueDate: string | null;
  dueTime: string | null;
  deadline: string | null;
  recurrence: string | null;
  durationMin: number | null;
  tokens: Token[];
}

export interface ParseOptions {
  now?: Date;
  /** Token kinds the user turned back into plain text (Backspace on a chip). */
  disabled?: Set<TokenType>;
}

type Span = { start: number; end: number };

/** Names may be wrapped in quotes to include spaces: #"Competing with Digital". */
const NAME = String.raw`"[^"]+"|[^\s#@/{}"]+`;
const unquote = (s: string) => s.replace(/^"|"$/g, "");
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

function resolve<T extends { id: string; name: string }>(items: T[], typed: string): T | null {
  const q = norm(typed);
  if (!q) return null;
  return (
    items.find((i) => norm(i.name) === q) ??
    items.find((i) => norm(i.name).startsWith(q)) ??
    items.find((i) => norm(i.name).includes(q)) ??
    null
  );
}

export function parseQuickAdd(input: string, state: AppState, opts: ParseOptions = {}): ParsedTask {
  const now = opts.now ?? new Date();
  const off = opts.disabled ?? new Set<TokenType>();
  const tokens: Token[] = [];
  const taken: Span[] = [];
  const overlaps = (a: Span) => taken.some((t) => a.start < t.end && t.start < a.end);
  const claim = (type: TokenType, start: number, end: number) => {
    taken.push({ start, end });
    tokens.push({ type, text: input.slice(start, end), start, end });
  };

  const result: ParsedTask = {
    title: "",
    projectId: null,
    unresolvedProject: null,
    sectionId: null,
    unresolvedSection: null,
    priority: null,
    labels: [],
    dueDate: null,
    dueTime: null,
    deadline: null,
    recurrence: null,
    durationMin: null,
    tokens,
  };

  const parseDay = (text: string) => {
    const hit = chrono.parse(text, now, { forwardDate: true })[0];
    return hit ? localDate(hit.start.date()) : null;
  };

  // 1. {deadline}
  if (!off.has("deadline")) {
    for (const m of input.matchAll(/\{([^}]+)\}/g)) {
      const date = parseDay(m[1]);
      if (date && !result.deadline) {
        result.deadline = date;
        claim("deadline", m.index!, m.index! + m[0].length);
      }
    }
  }

  // 2. #Project or #Parent/Sub
  let projectRef: string[] | null = null;
  if (!off.has("project")) {
    const m = new RegExp(String.raw`(?<=^|\s)#((?:${NAME})(?:/(?:${NAME}))?)(?=\s|$)`).exec(input);
    if (m && !overlaps({ start: m.index, end: m.index + m[0].length })) {
      projectRef = m[1].split(/\/(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(unquote);
      claim("project", m.index, m.index + m[0].length);
    }
  }
  if (projectRef) {
    const live = state.projects.filter((p) => !p.archived && p.id !== INBOX_ID);
    let project = null as (typeof live)[number] | null;
    if (projectRef.length === 2) {
      const parent = resolve(live.filter((p) => !p.parentId), projectRef[0]);
      project = parent ? resolve(live.filter((p) => p.parentId === parent.id), projectRef[1]) : null;
    } else {
      // "#Strategy" finds a subproject (or top-level project) by name; prefer exact matches.
      project = resolve(live, projectRef[0]);
    }
    if (project) result.projectId = project.id;
    else result.unresolvedProject = projectRef.join("/");
  }

  // 3. /Section (needs a project to be meaningful, but is still highlighted)
  if (!off.has("section")) {
    const m = new RegExp(String.raw`(?<=^|\s)/(${NAME})(?=\s|$)`).exec(input);
    if (m && !overlaps({ start: m.index, end: m.index + m[0].length })) {
      claim("section", m.index, m.index + m[0].length);
      const typed = unquote(m[1]);
      const sections = state.sections.filter((s) => s.projectId === result.projectId);
      const sec = result.projectId ? resolve(sections, typed) : null;
      if (sec) result.sectionId = sec.id;
      else result.unresolvedSection = typed;
    }
  }

  // 4. p1..p4
  if (!off.has("priority")) {
    const m = /(?<=^|\s)p([1-4])(?=\s|$)/i.exec(input);
    if (m && !overlaps({ start: m.index, end: m.index + m[0].length })) {
      result.priority = Number(m[1]) as Priority;
      claim("priority", m.index, m.index + m[0].length);
    }
  }

  // 5. @labels
  if (!off.has("label")) {
    for (const m of input.matchAll(/(?<=^|\s)@([^\s@#/{}]+)(?=\s|$)/g)) {
      const span = { start: m.index!, end: m.index! + m[0].length };
      if (overlaps(span)) continue;
      const name = m[1].toLowerCase();
      if (!result.labels.includes(name)) result.labels.push(name);
      claim("label", span.start, span.end);
    }
  }

  // 6. duration: "15m", "1h", "1h30m", "1.5h", "45 min", "for 2 hours", "for 1hr".
  //    "in 30m" is left alone so it can still mean a due time.
  if (!off.has("duration")) {
    const H = String.raw`(\d+(?:\.\d+)?)\s?(?:hours?|hrs?|h)`;
    const M = String.raw`(\d+)\s?(?:minutes?|mins?|m)`;
    const re = new RegExp(String.raw`(?<=^|\s)(?<!\bin\s)(?:for\s+)?(?:${H}(?:\s?${M})?|${M})(?=\s|$)`, "gi");
    for (const m of input.matchAll(re)) {
      const span = { start: m.index!, end: m.index! + m[0].length };
      if (overlaps(span)) continue;
      const min = Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? m[3] ?? 0);
      if (min <= 0) continue;
      result.durationMin = min;
      claim("duration", span.start, span.end);
      break;
    }
  }

  // 7. recurrence: "every ..." up to the next recognised token or the end
  let dueSource: { text: string; offset: number } | null = null;
  if (!off.has("recurrence")) {
    const m = /(?<=^|\s)every!?(?:\s+\S+)+/i.exec(input);
    if (m) {
      // Trim words that belong to other tokens already claimed after the match start.
      let end = m.index + m[0].length;
      for (const t of taken) if (t.start >= m.index && t.start < end) end = t.start;
      const text = input.slice(m.index, end).trimEnd();
      if (/^every!?\s+\S+/i.test(text)) {
        const span = { start: m.index, end: m.index + text.length };
        if (!overlaps(span)) {
          result.recurrence = text;
          claim("recurrence", span.start, span.end);
          // The first occurrence becomes the due date ("every mon" -> next Monday).
          dueSource = { text: text.replace(/^every!?\s+/i, "").replace(/\b(weekday|day|week|month|year)s?\b.*$/i, "$1"), offset: 0 };
        }
      }
    }
  }

  // 8. due date/time from what is left
  if (!off.has("due")) {
    let masked = input;
    for (const t of taken) masked = masked.slice(0, t.start) + " ".repeat(t.end - t.start) + masked.slice(t.end);
    // chrono does not know "tom"/"tmr"/"tmrw"; treat them as tomorrow.
    const abbr = /(?<=^|\s)(tom|tmr|tmrw)(?=\s|$)/i.exec(masked);
    let tomorrow: string | null = null;
    if (abbr) {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      tomorrow = localDate(d);
      claim("due", abbr.index, abbr.index + abbr[0].length);
      masked = masked.slice(0, abbr.index) + " ".repeat(abbr[0].length) + masked.slice(abbr.index + abbr[0].length);
    }
    const hit = chrono.parse(masked, now, { forwardDate: true })[0];
    if (tomorrow && !hit) {
      result.dueDate = tomorrow;
    } else if (hit) {
      const span = { start: hit.index, end: hit.index + hit.text.length };
      if (!overlaps(span)) {
        result.dueDate = tomorrow ?? localDate(hit.start.date());
        if (hit.start.isCertain("hour")) {
          const d = hit.start.date();
          result.dueTime = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
        claim("due", span.start, span.end);
      }
    } else if (dueSource) {
      const hit2 = chrono.parse(dueSource.text, now, { forwardDate: true })[0];
      if (hit2) result.dueDate = localDate(hit2.start.date());
      else if (/^(weekday|day|week|month|year)$/i.test(dueSource.text)) result.dueDate = localDate(now);
    }
  }

  // Title = input minus every claimed span, whitespace collapsed.
  const sorted = [...taken].sort((a, b) => a.start - b.start);
  let title = "";
  let pos = 0;
  for (const t of sorted) {
    title += input.slice(pos, t.start) + " ";
    pos = t.end;
  }
  title += input.slice(pos);
  result.title = title.replace(/\s+/g, " ").trim();
  tokens.sort((a, b) => a.start - b.start);
  return result;
}

/** Fields to hand to addTask. */
export function toNewTask(p: ParsedTask) {
  return {
    title: p.title,
    projectId: p.projectId ?? undefined,
    sectionId: p.sectionId,
    priority: p.priority ?? undefined,
    labels: p.labels,
    dueDate: p.dueDate,
    // Date with no time gets the 9:00 AM reminder at runtime; nothing stored here.
    dueTime: p.dueTime,
    deadline: p.deadline,
    recurrence: p.recurrence,
    durationMin: p.durationMin,
  };
}
