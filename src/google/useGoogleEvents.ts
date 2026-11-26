import { useEffect, useState } from "react";
import { fetchGoogleEvents, googleAvailable, loadGoogle } from "./client";
import type { CalEvent } from "./events";

export interface GoogleEventsState {
  connected: boolean;
  events: CalEvent[];
  loading: boolean;
  error: string | null;
}

/** Events for the visible days; refreshes every 5 minutes and when the window regains focus. */
export function useGoogleEvents(days: string[], enabled: boolean): GoogleEventsState {
  const auth = loadGoogle();
  const connected = googleAvailable() && !!auth.refreshToken;
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = days[0];
  const last = days[days.length - 1];

  useEffect(() => {
    if (!connected || !enabled) return;
    let cancelled = false;
    const load = async () => {
      const [y1, m1, d1] = first.split("-").map(Number);
      const [y2, m2, d2] = last.split("-").map(Number);
      setLoading(true);
      try {
        const next = await fetchGoogleEvents(loadGoogle(), new Date(y1, m1 - 1, d1), new Date(y2, m2 - 1, d2 + 1));
        if (!cancelled) {
          setEvents(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(typeof e === "string" ? e : e instanceof Error ? e.message : "Could not load Google Calendar");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 5 * 60_000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, [connected, enabled, first, last]);

  return { connected, events: enabled ? events : [], loading, error };
}
