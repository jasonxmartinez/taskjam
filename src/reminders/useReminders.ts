import { useEffect, useRef } from "react";
import { notify } from "../platform";
import type { Settings } from "../settings";
import type { AppState } from "../model/types";
import { dueNow, remindersFor } from "./schedule";

const FIRED_KEY = "todojam.fired.v1";
const DAY = 24 * 3600_000;

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Checks every 15 seconds and fires reminders once; survives reloads via localStorage. */
export function useReminders(state: AppState, settings: Settings, onOpen: (taskId: string) => void) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  const checkRef = useRef<() => void>(() => {});

  useEffect(() => {
    const check = () => {
      const now = Date.now();
      const fired = loadFired();
      const reminders = remindersFor(stateRef.current.tasks, { dateOnlyTime: settingsRef.current.dateOnlyReminderTime });
      const due = dueNow(reminders, new Set(Object.keys(fired)), now);
      for (const r of due) {
        fired[r.key] = now;
        void notify(r.title, r.body, () => openRef.current(r.taskId));
      }
      // Forget old entries.
      for (const k of Object.keys(fired)) if (now - fired[k] > 2 * DAY) delete fired[k];
      if (due.length) {
        try {
          localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
        } catch {
          // ignore
        }
      }
    };
    checkRef.current = check;
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, []);

  // A task added or rescheduled so a reminder is already due should not wait for the next tick.
  useEffect(() => checkRef.current(), [state.tasks]);
}
