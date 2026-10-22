"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Network resilience helpers. Firestore writes made while offline do not
 * reject: they wait in memory until the connection returns, so a button that
 * awaits one spins with no explanation. These let a page say so.
 */

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** Whether the browser reports a network connection. True during server rendering. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * True once `pending` has stayed true for `afterMs`, so a slow write can say
 * "still saving" instead of spinning silently. Resets when `pending` ends.
 */
export function useSlow(pending: boolean, afterMs = 5000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSlow(true), afterMs);
    return () => window.clearTimeout(timer);
  }, [pending, afterMs]);
  return slow;
}

/** An error carrying the `deadline-exceeded` code, which `describeError` turns into a connection sentence. */
export class TimeoutError extends Error {
  readonly code = "deadline-exceeded";
  constructor(message = "The request timed out.") {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * `fetch` that gives up after `timeoutMs` with a `TimeoutError`, so a request
 * that never answers (a captive portal, a dropped connection) cannot leave a
 * form pending forever.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 20000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new TimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
