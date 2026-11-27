import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { connectGoogle, disconnectGoogle, googleAvailable, loadGoogle } from "../google/client";
import { appVersion, checkForUpdate, ensureNotificationPermission, getLaunchAtLogin, isTauri, notificationsGranted, setLaunchAtLogin, type AppUpdate } from "../platform";
import type { Settings, Theme } from "../settings";
import { ICON } from "./common";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pb-5 pt-4">
      <h3 className="m-0 mb-3 text-[15px] font-medium">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const Hint = ({ children }: { children: ReactNode }) => <div className="mt-1.5 text-xs text-ink-muted">{children}</div>;

function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-accent" : "bg-line-strong"}`}
    >
      <span className={`absolute top-[3px] h-[18px] w-[18px] rounded-full bg-surface transition-[left] ${on ? "left-[15px]" : "left-[3px]"}`} />
    </button>
  );
}

export function SettingsDialog({
  settings,
  onChange,
  onClose,
  onGoogleChange,
  onUpdateFound,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onGoogleChange: () => void;
  onUpdateFound: (u: AppUpdate) => void;
}) {
  const [version, setVersion] = useState<string | null>(null);
  const [checking, setChecking] = useState<"idle" | "busy" | "latest" | "found">("idle");
  useEffect(() => void appVersion().then(setVersion), []);
  const checkNow = () => {
    setChecking("busy");
    void checkForUpdate().then((u) => {
      if (u) onUpdateFound(u);
      setChecking(u ? "found" : "latest");
    });
  };
  const [google, setGoogle] = useState(loadGoogle);
  const [gBusy, setGBusy] = useState(false);
  const [gError, setGError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  const [perm, setPerm] = useState<boolean | null>(null);
  const [asked, setAsked] = useState(false);
  const [offsets, setOffsets] = useState(settings.defaultReminders.join(", "));
  const [offsetsError, setOffsetsError] = useState(false);
  const [daily, setDaily] = useState(String(settings.dailyGoal));
  const [weekly, setWeekly] = useState(String(settings.weeklyGoal));
  useEffect(() => void getLaunchAtLogin().then(setLogin), []);
  useEffect(() => void notificationsGranted().then(setPerm), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const saveOffsets = (text: string) => {
    setOffsets(text);
    const nums = text.split(",").map((x) => x.trim()).filter(Boolean).map(Number);
    const ok = nums.every((n) => Number.isFinite(n) && n >= 0);
    setOffsetsError(!ok);
    if (ok) onChange({ ...settings, defaultReminders: [...new Set(nums.map(Math.round))] });
  };
  const goal = (text: string, set: (s: string) => void, key: "dailyGoal" | "weeklyGoal") => {
    set(text);
    const n = Number(text);
    if (Number.isInteger(n) && n > 0) onChange({ ...settings, [key]: n });
  };

  return (
    <div className="tj-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex max-h-[84vh] w-full max-w-[760px] flex-col rounded-[16px] border border-line bg-surface-raised shadow-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pb-4 pt-5">
          <h2 id="settings-title" className="tj-title m-0 text-[26px]">
            Settings
          </h2>
          <button aria-label="Close" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-ink-muted hover:bg-surface-hover">
            <X {...ICON} />
          </button>
        </div>

        <div className="grid gap-x-8 overflow-y-auto px-6 md:grid-cols-2">
          <div>
            <Section title="Appearance">
              <div className="inline-flex gap-0.5 rounded-[10px] bg-surface-hover p-[3px]" role="radiogroup" aria-label="Appearance">
                {(["system", "light", "dark"] as Theme[]).map((t) => (
                  <button
                    key={t}
                    role="radio"
                    aria-checked={settings.theme === t}
                    onClick={() => onChange({ ...settings, theme: t })}
                    className={`rounded-md px-4 py-1 capitalize ${settings.theme === t ? "bg-surface-raised font-medium text-ink shadow-raised" : "text-ink-muted"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Reminders">
              <label className="block text-[13px]">
                Default reminders, minutes before
                <input value={offsets} onChange={(e) => saveOffsets(e.target.value)} className="tj-input mt-1.5" aria-invalid={offsetsError} />
                <Hint>{offsetsError ? "Use whole minutes separated by commas, like 10, 30." : "Applies to new tasks. Separate with commas; 0 means at the due time."}</Hint>
              </label>
              <label className="block text-[13px]">
                Time for tasks with a date but no time
                <input type="time" value={settings.dateOnlyReminderTime} onChange={(e) => e.target.value && onChange({ ...settings, dateOnlyReminderTime: e.target.value })} className="tj-input mt-1.5 !w-36" />
              </label>
            </Section>

            <Section title="Goals">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[13px]">
                  Daily goal, tasks
                  <input type="number" min={1} value={daily} onChange={(e) => goal(e.target.value, setDaily, "dailyGoal")} className="tj-input mt-1.5" />
                </label>
                <label className="block text-[13px]">
                  Weekly goal, tasks
                  <input type="number" min={1} value={weekly} onChange={(e) => goal(e.target.value, setWeekly, "weeklyGoal")} className="tj-input mt-1.5" />
                </label>
              </div>
            </Section>
          </div>

          <div>
            <Section title="Google Calendar">
              <p className="m-0 text-[13px] text-ink-muted">Shows your events next to tasks. Read-only: events are never changed.</p>
              {!googleAvailable() ? (
                <Hint>Available in the Mac app. The setup guide is in docs/google-calendar-setup.md.</Hint>
              ) : google.refreshToken ? (
                <div className="flex items-center justify-between">
                  <span className="text-done">Connected</span>
                  <button
                    className="tj-btn tj-btn-secondary tj-btn-sm"
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
                  <label className="block text-[13px]">
                    Client ID
                    <input value={google.clientId} onChange={(e) => setGoogle({ ...google, clientId: e.target.value })} className="tj-input mt-1.5 font-mono text-xs" />
                  </label>
                  <label className="block text-[13px]">
                    Client secret
                    <input type="password" value={google.clientSecret} onChange={(e) => setGoogle({ ...google, clientSecret: e.target.value })} className="tj-input mt-1.5 font-mono text-xs" />
                  </label>
                  <button
                    disabled={gBusy || !google.clientId.trim() || !google.clientSecret.trim()}
                    className="tj-btn tj-btn-primary"
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
                  {gError && <div className="text-xs text-danger">{gError}</div>}
                  <Hint>Needs a free Google Cloud client. See the setup guide in docs.</Hint>
                </>
              )}
            </Section>

            <Section title="This Mac">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div>Notifications</div>
                  <div className="text-xs text-ink-muted">{perm ? "Allowed. Reminders will show." : asked ? "Blocked. Turn on in System Settings, Notifications." : "Needed for reminders"}</div>
                </div>
                {perm ? (
                  <span className="text-xs text-done">On</span>
                ) : (
                  <button
                    className="tj-btn tj-btn-secondary tj-btn-sm"
                    onClick={() =>
                      ensureNotificationPermission().then((ok) => {
                        setPerm(ok);
                        setAsked(true);
                      })
                    }
                  >
                    Allow
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div>Launch at login</div>
                  <div className="text-xs text-ink-muted">{isTauri() ? "Keeps reminders working" : "Available in the Mac app"}</div>
                </div>
                <Switch
                  label="Launch at login"
                  on={login}
                  disabled={!isTauri()}
                  onChange={(on) => {
                    setLogin(on);
                    void setLaunchAtLogin(on);
                  }}
                />
              </div>
            </Section>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-line px-6 py-3">
          <span className="flex items-center gap-3 text-xs text-ink-muted">
            Changes save automatically
            {version && (
              <>
                <span>· Version {version}</span>
                <button className="tj-btn tj-btn-secondary tj-btn-sm" disabled={checking === "busy"} onClick={checkNow}>
                  {checking === "busy" ? "Checking…" : checking === "latest" ? "Up to date" : checking === "found" ? "Update in sidebar" : "Check for updates"}
                </button>
              </>
            )}
          </span>
          <button className="tj-btn tj-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
