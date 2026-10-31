import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { scorePoint } from "@tennis/firebase-client";
import { unappliedQueuedPoints } from "@tennis/shared";
import type { Match, QueuedPoint } from "@tennis/shared";

/**
 * Points scored while the phone can't reach the server.
 *
 * A point whose `scoreMatchPoint` call fails for a connection reason is kept
 * here, on the device, instead of being lost or held behind a blocking alert,
 * and every later tap joins the same queue so the order is kept. The queue is
 * sent one point at a time, oldest first, as soon as a call can get through:
 * on a timer that backs off, and whenever the app comes back to the
 * foreground. Each point keeps its id, so a point whose request landed but
 * whose reply was lost is not counted twice.
 *
 * Which points are still waiting is read from the match document's
 * `lastPointId`, not from the replies, so the scoreboard is right whichever
 * arrives first. The queue is stored per match in AsyncStorage, so it survives
 * the app being closed.
 */

const STORAGE_PREFIX = "queued-points:";
const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000];
const SEND_TIMEOUT_MS = 15_000;

/** Errors a later retry can get past: no connection, a timeout, or a server hiccup. */
export function isRetryableScoringError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (typeof code !== "string") return true;
  return (
    code === "functions/unavailable" ||
    code === "functions/deadline-exceeded" ||
    code === "functions/internal" ||
    code === "functions/unknown" ||
    code === "functions/resource-exhausted"
  );
}

export interface QueuedPointsState {
  /** Points the server hasn't applied yet, oldest first. */
  pending: QueuedPoint[];
  /** True once the stored queue has been read, so a tap can't overtake it. */
  ready: boolean;
  /** True while the oldest point is on its way to the server. */
  sending: boolean;
  enqueue: (point: Omit<QueuedPoint, "queuedAt">) => void;
  /**
   * Takes back the newest queued point, for undo. Returns false when the
   * queue is empty or that point is already being sent.
   */
  popLast: () => boolean;
  /** Sends now instead of waiting for the next retry. */
  flush: () => void;
}

export function useQueuedPoints(
  matchId: string | undefined,
  match: Match | null,
  onDropped: (count: number, err: unknown) => void,
): QueuedPointsState {
  const [queue, setQueue] = useState<QueuedPoint[]>([]);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const onDroppedRef = useRef(onDropped);
  onDroppedRef.current = onDropped;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const storageKey = matchId ? `${STORAGE_PREFIX}${matchId}` : null;

  useEffect(() => {
    setQueue([]);
    setReady(false);
    if (!storageKey) return;
    let cancelled = false;
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (cancelled) return;
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        setQueue(Array.isArray(parsed) ? (parsed as QueuedPoint[]) : []);
      })
      .catch((err) => console.warn("Couldn't read queued points:", err))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Persist every change once the stored queue has been read.
  useEffect(() => {
    if (!storageKey || !ready) return;
    const write =
      queue.length > 0
        ? AsyncStorage.setItem(storageKey, JSON.stringify(queue))
        : AsyncStorage.removeItem(storageKey);
    write.catch((err) => console.warn("Couldn't store queued points:", err));
  }, [queue, storageKey, ready]);

  const lastPointId = match?.lastPointId;
  const pending = useMemo(() => unappliedQueuedPoints(queue, lastPointId), [queue, lastPointId]);

  // Drop the points the match document shows the server has applied.
  useEffect(() => {
    if (pending.length !== queue.length) setQueue(pending);
  }, [pending, queue.length]);

  const matchLive = match?.status === "in_progress" || match?.status === "scheduled";

  useEffect(() => {
    if (!matchId || !ready || pending.length === 0 || sendingRef.current) return;
    // The match finished or was cancelled on another device: nothing queued
    // can be applied any more.
    if (match && !matchLive) {
      const count = pending.length;
      setQueue([]);
      onDroppedRef.current(count, null);
      return;
    }
    const head = pending[0];
    sendingRef.current = head.pointId;
    setSending(true);
    scorePoint(matchId, match as Match, head.scorer, head.pointAttribution, head.pointId, SEND_TIMEOUT_MS)
      .then(() => {
        attemptRef.current = 0;
        setQueue((current) => current.filter((point) => point.pointId !== head.pointId));
      })
      .catch((err) => {
        if (!isRetryableScoringError(err)) {
          // Refused for good (the match ended, or this account can't score
          // it), so the rest can't land either.
          const count = queueRef.current.length;
          setQueue([]);
          onDroppedRef.current(count, err);
          return;
        }
        const delay = RETRY_DELAYS_MS[Math.min(attemptRef.current, RETRY_DELAYS_MS.length - 1)];
        attemptRef.current += 1;
        if (retryTimer.current) clearTimeout(retryTimer.current);
        retryTimer.current = setTimeout(() => setRetryTick((tick) => tick + 1), delay);
      })
      .finally(() => {
        sendingRef.current = null;
        setSending(false);
      });
    // `match` is left out on purpose: it is read for its status (matchLive is
    // in the list) and passed through to scorePoint, which ignores it, so
    // re-running on every snapshot would only resend sooner.
  }, [matchId, ready, pending, matchLive, retryTick, sending]);

  const flush = useCallback(() => {
    attemptRef.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setRetryTick((tick) => tick + 1);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") flush();
    });
    return () => {
      subscription.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [flush]);

  const enqueue = useCallback((point: Omit<QueuedPoint, "queuedAt">) => {
    setQueue((current) =>
      current.some((existing) => existing.pointId === point.pointId)
        ? current
        : [...current, { ...point, queuedAt: Date.now() }],
    );
  }, []);

  const popLast = useCallback(() => {
    const last = pending[pending.length - 1];
    if (!last || sendingRef.current === last.pointId) return false;
    setQueue((current) => current.filter((point) => point.pointId !== last.pointId));
    return true;
  }, [pending]);

  // One object per change, so callbacks that depend on it stay stable between points.
  return useMemo(
    () => ({ pending, ready, sending, enqueue, popLast, flush }),
    [pending, ready, sending, enqueue, popLast, flush],
  );
}
