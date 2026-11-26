import { isTauri } from "../platform";
import { normalizeEvents, type CalEvent, type RawCalendars } from "./events";

const KEY = "todojam.google.v1";

export interface GoogleAuth {
  clientId: string;
  clientSecret: string;
  /** Present once signed in. Kept in local storage for now (not the macOS Keychain). */
  refreshToken: string | null;
}

export function loadGoogle(): GoogleAuth {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<GoogleAuth> | null;
    if (raw) return { clientId: raw.clientId ?? "", clientSecret: raw.clientSecret ?? "", refreshToken: raw.refreshToken ?? null };
  } catch {
    // fall through
  }
  return { clientId: "", clientSecret: "", refreshToken: null };
}

export function saveGoogle(a: GoogleAuth) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    // ignore
  }
}

export const googleAvailable = () => isTauri();

/** Opens the browser for sign-in; resolves with the saved credentials. */
export async function connectGoogle(clientId: string, clientSecret: string): Promise<GoogleAuth> {
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{ refresh_token: string }>("google_connect", { clientId: clientId.trim(), clientSecret: clientSecret.trim() });
  const auth = { clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken: res.refresh_token };
  saveGoogle(auth);
  return auth;
}

export function disconnectGoogle(auth: GoogleAuth): GoogleAuth {
  const next = { ...auth, refreshToken: null };
  saveGoogle(next);
  return next;
}

/** Events between two instants, from every calendar you have selected in Google Calendar. */
export async function fetchGoogleEvents(auth: GoogleAuth, from: Date, to: Date): Promise<CalEvent[]> {
  if (!auth.refreshToken) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<RawCalendars>("google_fetch_events", {
    clientId: auth.clientId,
    clientSecret: auth.clientSecret,
    refreshToken: auth.refreshToken,
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
  });
  return normalizeEvents(raw);
}
