import { useEffect, useState } from "react";
import { ensureNotificationPermission, getLaunchAtLogin, isTauri, setLaunchAtLogin } from "../platform";
import { connectGoogle, disconnectGoogle, googleAvailable, loadGoogle } from "../google/client";
import type { Settings } from "../settings";

export function SettingsDialog({ settings, onChange, onClose, onGoogleChange }: { settings: Settings; onChange: (s: Settings) => void; onClose: () => void; onGoogleChange: () => void }) {
  const [google, setGoogle] = useState(loadGoogle);
  const [gBusy, setGBusy] = useState(false);
  const [gError, setGError] = useState<string | null>(null);
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
      <div className="max-h-[85vh] w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
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
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label>
            Daily goal (tasks)
            <input type="number" min={1} value={settings.dailyGoal} onChange={(e) => Number(e.target.value) > 0 && onChange({ ...settings, dailyGoal: Number(e.target.value) })} className="mt-1 block w-full rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" />
          </label>
          <label>
            Weekly goal (tasks)
            <input type="number" min={1} value={settings.weeklyGoal} onChange={(e) => Number(e.target.value) > 0 && onChange({ ...settings, weeklyGoal: Number(e.target.value) })} className="mt-1 block w-full rounded border border-slate-300 bg-transparent p-1 dark:border-slate-700" />
          </label>
        </div>
        <div className="text-sm">
          <button className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700" onClick={() => ensureNotificationPermission().then(setPerm)}>
            Allow notifications
          </button>
          {perm !== null && <span className="ml-2 text-xs">{perm ? "Allowed" : "Blocked: enable in System Settings > Notifications"}</span>}
        </div>
        <div className="space-y-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-800">
          <div className="font-medium">Google Calendar</div>
          {!googleAvailable() ? (
            <div className="text-xs text-slate-500">Available in the Mac app. See docs/google-calendar-setup.md.</div>
          ) : google.refreshToken ? (
            <div className="flex items-center gap-3">
              <span className="text-emerald-600">Connected (read-only)</span>
              <button
                className="rounded border border-slate-300 px-2 py-1 dark:border-slate-700"
                onClick={() => {
                  setGoogle(disconnectGoogle(google));
                  onGoogleChange();
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <>
              <label className="block">
                Client ID
                <input value={google.clientId} onChange={(e) => setGoogle({ ...google, clientId: e.target.value })} className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 font-mono text-xs dark:border-slate-700" />
              </label>
              <label className="block">
                Client secret
                <input type="password" value={google.clientSecret} onChange={(e) => setGoogle({ ...google, clientSecret: e.target.value })} className="mt-1 w-full rounded border border-slate-300 bg-transparent p-1 font-mono text-xs dark:border-slate-700" />
              </label>
              <button
                disabled={gBusy || !google.clientId.trim() || !google.clientSecret.trim()}
                className="rounded bg-indigo-600 px-3 py-1 text-white disabled:opacity-40"
                onClick={async () => {
                  setGBusy(true);
                  setGError(null);
                  try {
                    setGoogle(await connectGoogle(google.clientId, google.clientSecret));
                    onGoogleChange();
                  } catch (e) {
                    setGError(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not connect");
                  } finally {
                    setGBusy(false);
                  }
                }}
              >
                {gBusy ? "Waiting for Google in your browser…" : "Connect Google Calendar"}
              </button>
              {gError && <div className="text-xs text-red-600">{gError}</div>}
              <div className="text-xs text-slate-500">Needs a free Google Cloud client: see docs/google-calendar-setup.md. Events are read-only and never changed.</div>
            </>
          )}
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
