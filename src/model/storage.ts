import { emptyState } from "./db";
import { DEFAULT_PROJECT_COLOR, INBOX_ID, LEGACY_DEFAULT_COLOR, type AppState } from "./types";

const MIGRATED_KEY = "todojam.colorsMigrated";

/** Projects made before colors existed all got indigo without anyone choosing it: make them grey, once. */
function migrate(s: AppState): AppState {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return s;
    localStorage.setItem(MIGRATED_KEY, "1");
  } catch {
    return s;
  }
  return {
    ...s,
    projects: s.projects.map((p) => (p.id !== INBOX_ID && p.color === LEGACY_DEFAULT_COLOR ? { ...p, color: DEFAULT_PROJECT_COLOR } : p)),
  };
}

export const STATE_KEY = "todojam.state.v1";
const KEY = STATE_KEY;

/** Browser storage for now; a SQLite adapter replaces this when the Tauri shell lands. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.projects?.length && Array.isArray(parsed.tasks)) return migrate(parsed);
    }
  } catch {
    // fall through to empty state
  }
  return emptyState();
}

export function saveState(s: AppState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable; keep working in memory
  }
}
