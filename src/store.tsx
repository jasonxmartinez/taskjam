import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadState, saveState } from "./model/storage";
import type { AppState } from "./model/types";

interface Store {
  state: AppState;
  /** Apply a pure state transition; thrown errors are returned as a message. */
  apply: (fn: (s: AppState) => AppState) => string | null;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(loadState);
  useEffect(() => saveState(state), [state]);

  const ref = useRef(state);
  const apply = useCallback((fn: (s: AppState) => AppState) => {
    try {
      const next = fn(ref.current);
      ref.current = next;
      setState(next);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, []);
  const value = useMemo(() => ({ state, apply }), [state, apply]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}

/** Re-renders every second while `active`, for live timers. */
export function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}
