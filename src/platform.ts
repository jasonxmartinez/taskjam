/** Thin layer over the Mac shell (Tauri) with browser fallbacks, so the app also runs in a plain browser. */

export const isTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function ensureNotificationPermission(): Promise<boolean> {
  if (isTauri()) {
    const n = await import("@tauri-apps/plugin-notification");
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === "granted";
  }
  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

/** Whether notifications are allowed, without asking. */
export async function notificationsGranted(): Promise<boolean> {
  if (isTauri()) {
    const n = await import("@tauri-apps/plugin-notification");
    return n.isPermissionGranted();
  }
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function notify(title: string, body: string, onClick?: () => void) {
  if (isTauri()) {
    const n = await import("@tauri-apps/plugin-notification");
    n.sendNotification({ title, body });
    return;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const note = new Notification(title, { body });
    if (onClick) note.onclick = () => (window.focus(), onClick());
  }
}

/** Menu bar text next to the icon, e.g. the running timer. Empty string clears it. */
export async function setTrayTitle(title: string) {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_tray_title", { title });
}

export async function hideQuickAddWindow() {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("hide_quick_add");
}

export async function getLaunchAtLogin(): Promise<boolean> {
  if (!isTauri()) return false;
  const a = await import("@tauri-apps/plugin-autostart");
  return a.isEnabled();
}

export async function setLaunchAtLogin(on: boolean) {
  if (!isTauri()) return;
  const a = await import("@tauri-apps/plugin-autostart");
  await (on ? a.enable() : a.disable());
}

export type AppUpdate = { version: string; install: () => Promise<void> };

/** The installed app's version, or null in the browser. */
export async function appVersion(): Promise<string | null> {
  if (!isTauri()) return null;
  const { getVersion } = await import("@tauri-apps/api/app");
  return getVersion();
}

/** Asks GitHub for a newer build. Null when up to date, offline, or in the browser. */
export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return null;
    return {
      version: update.version,
      install: async () => {
        await update.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch {
    return null;
  }
}
