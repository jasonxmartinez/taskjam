import { INBOX_ID, type AppState, type Project } from "../model/types";
import { parseQuickAdd } from "./quickAdd";

export type CompletionKind = "project" | "section" | "priority" | "label";

export interface Suggestion {
  key: string;
  /** What the list shows. */
  label: string;
  /** Secondary text, e.g. the parent project. */
  hint?: string;
  /** Text that replaces the token being typed. */
  insert: string;
}

export interface Completion {
  kind: CompletionKind;
  /** Range of the input that a picked suggestion replaces. */
  start: number;
  end: number;
  items: Suggestion[];
}

const MAX_ITEMS = 8;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Quote names the parser could not read bare (spaces, slashes, symbols). */
const quote = (name: string) => (/^[^\s#@/{}"]+$/.test(name) ? name : `"${name}"`);

/** 0 = name starts with the query, 1 = a later word does, -1 = no match. */
function rank(name: string, query: string): number {
  const q = norm(query);
  if (!q) return 0;
  if (norm(name).startsWith(q)) return 0;
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  for (let i = 1; i < words.length; i++) if (norm(words.slice(i).join("")).startsWith(q)) return 1;
  return -1;
}

function ranked<T>(items: T[], name: (t: T) => string, query: string): T[] {
  return items
    .map((item, i) => ({ item, i, r: rank(name(item), query) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/** Projects in sidebar order: each parent followed by its subprojects. */
function projectsInOrder(s: AppState): Project[] {
  const live = s.projects.filter((p) => !p.archived);
  const top = live.filter((p) => !p.parentId).sort((a, b) => (a.id === INBOX_ID ? -1 : b.id === INBOX_ID ? 1 : a.order - b.order));
  return top.flatMap((p) => [p, ...live.filter((c) => c.parentId === p.id).sort((a, b) => a.order - b.order)]);
}

const unq = (s: string) => s.replace(/"/g, "");

/**
 * Suggestions for the token under the caret in the quick-add box:
 * #project, #Parent/sub, /section, p1-p4 and @label, matched by prefix.
 */
export function completeAt(input: string, caret: number, state: AppState, defaultProjectId?: string): Completion | null {
  const before = input.slice(0, caret);
  // The token being typed: starts after whitespace, may contain an open "quoted name".
  const m = /(?:^|\s)((?:[#/@](?:[^\s"]*"[^"]*|[^\s"]*))|p[1-4]?)$/i.exec(before);
  if (!m) return null;
  const token = m[1];
  const start = caret - token.length;
  const after = /^[^\s]*/.exec(input.slice(caret))![0];
  const end = caret + after.length;
  const full = token + after;
  const sigil = token[0];

  let kind: CompletionKind;
  let items: Suggestion[] = [];

  if (sigil === "#") {
    kind = "project";
    const body = unq(token.slice(1));
    const all = projectsInOrder(state);
    const slash = body.indexOf("/");
    if (slash >= 0) {
      // #Parent/sub: subprojects of the matching parent.
      const parentQ = body.slice(0, slash);
      const parents = ranked(all.filter((p) => !p.parentId && p.id !== INBOX_ID), (p) => p.name, parentQ);
      const parent = parents.find((p) => norm(p.name) === norm(parentQ)) ?? parents[0];
      const kids = parent ? all.filter((p) => p.parentId === parent.id) : [];
      items = ranked(kids, (p) => p.name, body.slice(slash + 1)).map((p) => ({
        key: p.id,
        label: p.name,
        hint: parent!.name,
        insert: `#${quote(parent!.name)}/${quote(p.name)}`,
      }));
    } else {
      const byId = new Map(all.map((p) => [p.id, p]));
      items = ranked(all, (p) => p.name, body).map((p) => {
        const parent = p.parentId ? byId.get(p.parentId) : undefined;
        return {
          key: p.id,
          label: p.name,
          hint: parent?.name,
          insert: parent ? `#${quote(parent.name)}/${quote(p.name)}` : `#${quote(p.name)}`,
        };
      });
    }
  } else if (sigil === "/") {
    kind = "section";
    const q = unq(token.slice(1));
    // Which project is the task going to? Parse the rest of the line.
    const rest = input.slice(0, start) + input.slice(end);
    const parsed = parseQuickAdd(rest, state);
    const projectId = parsed.projectId ?? (parsed.unresolvedProject ? null : defaultProjectId ?? null);
    const projects = new Map(state.projects.map((p) => [p.id, p]));
    const pool = state.sections
      .filter((s) => (projectId && projectId !== INBOX_ID ? s.projectId === projectId : !parsed.unresolvedProject))
      .filter((s) => !projects.get(s.projectId)?.archived)
      .sort((a, b) => a.order - b.order);
    const hasProjectToken = parsed.tokens.some((t) => t.type === "project");
    items = ranked(pool, (s) => s.name, q).map((s) => {
      const p = projects.get(s.projectId);
      const parent = p?.parentId ? projects.get(p.parentId) : undefined;
      const projectToken = p ? (parent ? `#${quote(parent.name)}/${quote(p.name)}` : `#${quote(p.name)}`) : "";
      // No project chosen yet: picking a section also picks its project.
      const needsProject = !hasProjectToken && (!projectId || projectId === INBOX_ID);
      return { key: s.id, label: s.name, hint: p?.name, insert: needsProject && projectToken ? `${projectToken} /${quote(s.name)}` : `/${quote(s.name)}` };
    });
  } else if (sigil === "@") {
    kind = "label";
    items = ranked([...state.labels].sort((a, b) => a.name.localeCompare(b.name)), (l) => l.name, token.slice(1)).map((l) => ({
      key: l.name,
      label: l.name,
      insert: `@${l.name}`,
    }));
  } else {
    kind = "priority";
    const names = ["Urgent", "High", "Medium", "None"];
    items = [1, 2, 3, 4]
      .filter((n) => `p${n}`.startsWith(full.toLowerCase()))
      .map((n) => ({ key: `p${n}`, label: `p${n}`, hint: names[n - 1], insert: `p${n}` }));
  }

  items = items.slice(0, MAX_ITEMS);
  // Nothing left to complete: the token already reads exactly like the only match.
  if (!items.length || (items.length === 1 && items[0].insert.toLowerCase() === full.toLowerCase())) return null;
  return { kind, start, end, items };
}

/** Replace the token with the suggestion; returns the new text and caret. */
export function applySuggestion(input: string, c: Completion, s: Suggestion): { text: string; caret: number } {
  const tail = input.slice(c.end);
  const sep = tail.startsWith(" ") ? "" : " ";
  const text = input.slice(0, c.start) + s.insert + sep + tail;
  return { text, caret: c.start + s.insert.length + 1 };
}
