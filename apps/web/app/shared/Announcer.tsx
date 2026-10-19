"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconCircleCheck, IconX } from "@tabler/icons-react";
import { color, radius, shadow, type } from "./tokens";

export type AnnounceOptions = {
  /** "assertive" interrupts the screen reader; use it only for errors. */
  politeness?: "polite" | "assertive";
  /** Also show the message as a short visible toast. */
  toast?: boolean;
  /** Toast lifetime in ms. Defaults to 5000. */
  duration?: number;
};

type AnnounceFn = (message: string, options?: AnnounceOptions) => void;

const AnnouncerContext = createContext<AnnounceFn | null>(null);

type Toast = { id: number; message: string };

/**
 * Mounted once in the root layout. Holds two visually hidden live regions
 * (polite and assertive) and a toast stack, and gives every page
 * `useAnnounce()`.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const announce = useCallback<AnnounceFn>(
    (message, options = {}) => {
      const { politeness = "polite", toast = false, duration = 5000 } = options;
      const set = politeness === "assertive" ? setAssertive : setPolite;
      // Clear first so an identical message is announced again.
      set("");
      setTimeout(() => set(message), 50);
      if (toast) {
        const id = nextId.current++;
        setToasts((current) => [...current.slice(-2), { id, message }]);
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
      {/* The toasts repeat what the live region already announced, so they are
          hidden from assistive technology to avoid a double announcement. */}
      <div className="tl-toast-region" aria-hidden="true">
        {toasts.map((toast) => (
          <div key={toast.id} className="tl-toast" style={styles.toast}>
            <IconCircleCheck size={20} aria-hidden="true" color="var(--green-light)" />
            <span style={styles.toastText}>{toast.message}</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => dismiss(toast.id)}
              style={styles.toastClose}
              aria-label="Dismiss"
            >
              <IconX size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </AnnouncerContext.Provider>
  );
}

let warnedMissingProvider = false;

/**
 * Returns `announce(message, options?)`. Messages go to an aria-live region,
 * so a screen reader hears outcomes like "Proposal accepted" without focus
 * moving. Pass `{ toast: true }` to show the message visibly as well.
 */
export function useAnnounce(): AnnounceFn {
  const context = useContext(AnnouncerContext);
  return useMemo<AnnounceFn>(() => {
    if (context) return context;
    return (message) => {
      if (!warnedMissingProvider && process.env.NODE_ENV !== "production") {
        warnedMissingProvider = true;
        console.warn("useAnnounce() called outside <AnnouncerProvider>; message dropped:", message);
      }
    };
  }, [context]);
}

const styles = {
  toast: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 8px 10px 14px",
    background: color.clubhouseGreen,
    color: color.surface,
    borderRadius: radius.md,
    boxShadow: shadow.raised,
  },
  toastText: { ...type.label, flex: 1, minWidth: 0, overflowWrap: "anywhere" },
  toastClose: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    background: "transparent",
    border: "none",
    borderRadius: radius.sm,
    color: color.surface,
  },
} satisfies Record<string, React.CSSProperties>;
