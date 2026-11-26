export type Theme = "system" | "light" | "dark";

export interface Settings {
  /** Appearance: follow macOS, or force light or dark. */
  theme: Theme;
  /** Minutes before the due time, applied to new tasks. */
  defaultReminders: number[];
  /** Local HH:mm for tasks that have a date but no time. */
  dateOnlyReminderTime: string;
  /** Stats goals, as in your Todoist setup. */
  dailyGoal: number;
  weeklyGoal: number;
}

export const DEFAULT_SETTINGS: Settings = { theme: "system", defaultReminders: [10], dateOnlyReminderTime: "09:00", dailyGoal: 5, weeklyGoal: 30 };

const KEY = "todojam.settings.v1";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return {
        theme: s.theme === "light" || s.theme === "dark" ? s.theme : "system",
        defaultReminders: Array.isArray(s.defaultReminders) ? s.defaultReminders.filter((n) => Number.isFinite(n) && n >= 0) : DEFAULT_SETTINGS.defaultReminders,
        dateOnlyReminderTime: /^\d{2}:\d{2}$/.test(s.dateOnlyReminderTime ?? "") ? s.dateOnlyReminderTime! : DEFAULT_SETTINGS.dateOnlyReminderTime,
        dailyGoal: Number.isFinite(s.dailyGoal) && s.dailyGoal! > 0 ? s.dailyGoal! : DEFAULT_SETTINGS.dailyGoal,
        weeklyGoal: Number.isFinite(s.weeklyGoal) && s.weeklyGoal! > 0 ? s.weeklyGoal! : DEFAULT_SETTINGS.weeklyGoal,
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

/** Applies the appearance setting to the page (System follows macOS). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}
