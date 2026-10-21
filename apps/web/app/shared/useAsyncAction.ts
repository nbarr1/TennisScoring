"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAnnounce } from "./Announcer";

/**
 * Turns any thrown value into a sentence a player can act on.
 *
 * Firebase errors carry a `code` such as `permission-denied` (Firestore) or
 * `functions/permission-denied` (callables). Callable errors raised on purpose
 * by our Cloud Functions already carry a user-facing message, so for those
 * codes the server's message is kept; transport-level failures get a fixed
 * sentence that names the recovery.
 */
export function describeError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!error) return fallback;
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code).replace(/^(functions|firestore|auth|storage)\//, "")
      : "";
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "";

  switch (code) {
    case "unavailable":
    case "network-request-failed":
    case "deadline-exceeded":
      return "Couldn't reach the server. Check your connection and try again.";
    case "unauthenticated":
    case "user-token-expired":
      return "Your session has expired. Sign in again to continue.";
    case "permission-denied":
      return "You don't have permission to do that.";
    case "not-found":
      return message && !/^not[- ]found$/i.test(message) ? message : "That item no longer exists. Refresh the page.";
    case "resource-exhausted":
    case "too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "internal":
      return fallback;
    default:
      break;
  }

  // fetch() rejects with a bare TypeError when the network is down; its
  // message ("Failed to fetch", "Load failed", "NetworkError ...") means
  // nothing to a player.
  if (error instanceof TypeError && /failed to fetch|load failed|networkerror|network request failed/i.test(message)) {
    return "Couldn't reach the server. Check your connection and try again.";
  }

  // Strip the SDK's "FirebaseError: " prefix and trailing "(code)" noise.
  const cleaned = message
    .replace(/^FirebaseError:\s*/i, "")
    .replace(/^Firebase:\s*/i, "")
    .replace(/\s*\([a-z-]+\/[a-z-]+\)\.?$/i, "")
    .trim();
  return cleaned || fallback;
}

export type AsyncActionOptions<T> = {
  /** Announced (aria-live) and optionally toasted after success. */
  successMessage?: string | ((result: T) => string);
  /** Show the success message as a visible toast as well. Defaults to true. */
  toastSuccess?: boolean;
  /** Fallback sentence when the error carries no usable message. */
  errorMessage?: string;
  /** Map an error to a message yourself. Overrides `describeError`. */
  mapError?: (error: unknown) => string;
  onSuccess?: (result: T) => void;
  onError?: (error: unknown) => void;
};

export type AsyncAction<Args extends unknown[], T> = {
  /** Runs the action. Ignored while a previous run is still pending. */
  run: (...args: Args) => Promise<T | undefined>;
  pending: boolean;
  /** User-facing error from the last run, or null. */
  error: string | null;
  setError: (message: string | null) => void;
  reset: () => void;
};

/**
 * Wraps an async handler with pending, error, and success-announcement state,
 * and guards against double submission.
 *
 *   const accept = useAsyncAction(() => acceptMatchProposal(id), { successMessage: "Proposal accepted" });
 *   <Button pending={accept.pending} onClick={() => void accept.run()}>Accept proposal</Button>
 *   {accept.error && <InlineAlert tone="error">{accept.error}</InlineAlert>}
 */
export function useAsyncAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
  options: AsyncActionOptions<T> = {},
): AsyncAction<Args, T> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ action, options });
  latest.current = { action, options };
  const announce = useAnnounce();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: Args): Promise<T | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      setPending(true);
      setError(null);
      const { action: current, options: opts } = latest.current;
      try {
        const result = await current(...args);
        const message =
          typeof opts.successMessage === "function" ? opts.successMessage(result) : opts.successMessage;
        if (message) announce(message, { toast: opts.toastSuccess ?? true });
        opts.onSuccess?.(result);
        return result;
      } catch (caught) {
        const message = opts.mapError ? opts.mapError(caught) : describeError(caught, opts.errorMessage);
        if (mounted.current) setError(message);
        opts.onError?.(caught);
        return undefined;
      } finally {
        inFlight.current = false;
        if (mounted.current) setPending(false);
      }
    },
    [announce],
  );

  const reset = useCallback(() => {
    setError(null);
  }, []);

  return { run, pending, error, setError, reset };
}
