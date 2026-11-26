export interface Settings {
  /** Minutes before the due time, applied to new tasks. */
  defaultReminders: number[];
  /** Local HH:mm for tasks that have a date but no time. */
  dateOnlyReminderTime: string;
}

export const DEFAULT_SETTINGS: Settings = { defaultReminders: [10], dateOnlyReminderTime: "09:00" };

const KEY = "todojam.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return {
        defaultReminders: Array.isArray(s.defaultReminders) ? s.defaultReminders.filter((n) => Number.isFinite(n) && n >= 0) : DEFAULT_SETTINGS.defaultReminders,
        dateOnlyReminderTime: /^\d{2}:\d{2}$/.test(s.dateOnlyReminderTime ?? "") ? s.dateOnlyReminderTime! : DEFAULT_SETTINGS.dateOnlyReminderTime,
      };
    }
  } catch {
    // use defaults
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}
