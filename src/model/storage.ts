import { emptyState } from "./db";
import type { AppState } from "./types";

const KEY = "todojam.state.v1";

/** Browser storage for now; a SQLite adapter replaces this when the Tauri shell lands. */
export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.projects?.length && Array.isArray(parsed.tasks)) return parsed;
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
