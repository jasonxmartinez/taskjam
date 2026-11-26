import { useEffect, useState } from "react";
import { ensureNotificationPermission, getLaunchAtLogin, isTauri, setLaunchAtLogin } from "../platform";
import type { Settings } from "../settings";

export function SettingsDialog({ settings, onChange, onClose }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void }) {
  const [login, setLogin] = useState(false);
  const [perm, setPerm] = useState<boolean | null>(null);
  const [offsets, setOffsets] = useState(settings.defaultReminders.join(", "));
  useEffect(() => void getLaunchAtLogin().then(setLogin), []);

  const saveOffsets = (text: string) => {
    setOffsets(text);
    const nums = text.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
    if (nums.every((n) => Number.isFinite(n) && n >= 0)) onChange({ ...settings, defaultReminders: nums });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-24" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <label className="block text-sm">
          Default reminders (minutes before, comma separated)
          <input value={offsets} onChange={(e) => saveOffsets(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" />
          <span className="text-xs text-slate-500">Applies to new tasks. 10 = ten minutes before; 0 = at the due time; empty = none.</span>
        </label>
        <label className="block text-sm">
          Reminder time for tasks with a date but no time
          <input type="time" value={settings.dateOnlyReminderTime} onChange={(e) => e.target.value && onChange({ ...settings, dateOnlyReminderTime: e.target.value })} className="mt-1 block rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" />
        </label>
        <div className="text-sm">
          <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700" onClick={() => ensureNotificationPermission().then(setPerm)}>
            Allow notifications
          </button>
          {perm !== null && <span className="ml-2 text-xs">{perm ? "Allowed" : "Blocked: enable in System Settings > Notifications"}</span>}
        </div>
        {isTauri() && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={login} onChange={(e) => { setLogin(e.target.checked); void setLaunchAtLogin(e.target.checked); }} />
            Launch at login (keeps reminders working)
          </label>
        )}
      </div>
    </div>
  );
}
