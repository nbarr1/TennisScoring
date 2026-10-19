import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { announce } from "./a11y";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** A verb naming the action, e.g. "Decline", "Delete match". Never "OK". */
  confirmLabel: string;
  /** Defaults to "Cancel". Name the safe choice when it helps ("Keep match"). */
  cancelLabel?: string;
  /** Styles the confirm button as destructive on iOS. */
  destructive?: boolean;
};

/**
 * Ask before an action, resolving `true` only when the confirm button is
 * pressed. Tapping outside the dialog (Android) or Cancel resolves `false`.
 * Uses the native alert on both platforms: Material dialog on Android, UIKit
 * alert on iOS (where the destructive button renders red).
 */
export function confirmAction({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // Order matters on Android: with two buttons the first is the negative
    // (left) action and the second the positive (right) one.
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: "cancel", onPress: () => settle(false) },
        {
          text: confirmLabel,
          style: destructive ? "destructive" : "default",
          onPress: () => settle(true),
        },
      ],
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });
}

/**
 * Confirm a destructive or hard-to-undo action (delete, remove, decline,
 * cancel a match). Say what will happen in `message`, and name the action in
 * `confirmLabel`.
 *
 *   if (!(await confirmDestructive({ title: "Delete this match?",
 *     message: "Its score and report are removed for both players.",
 *     confirmLabel: "Delete match" }))) return;
 */
export function confirmDestructive(
  options: Omit<ConfirmOptions, "destructive">,
): Promise<boolean> {
  return confirmAction({ ...options, destructive: true });
}

/**
 * A user-facing sentence for a thrown error. Firebase errors carry a readable
 * `message`; bare codes such as "internal" or "INTERNAL" are not, so those
 * fall back to `fallback`.
 */
export function describeError(
  error: unknown,
  fallback = "Something went wrong. Check your connection and try again.",
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : typeof (error as { message?: unknown })?.message === "string"
          ? String((error as { message: string }).message)
          : "";
  const trimmed = message.replace(/^Firebase:\s*/i, "").trim();
  if (!trimmed || /^[a-z-]+(\/[a-z-]+)?$/i.test(trimmed)) return fallback;
  return trimmed;
}

export type AsyncActionOptions<R> = {
  /** Announced to screen readers when the action succeeds. */
  successMessage?: string | ((result: R) => string | undefined);
  /** Overrides the error text; receives the thrown value. */
  errorMessage?: string | ((error: unknown) => string);
  onSuccess?: (result: R) => void;
  onError?: (error: unknown) => void;
  /** Announce the error to screen readers (default true). */
  announceError?: boolean;
};

export type AsyncAction<A extends unknown[], R> = {
  /**
   * Runs the action. Ignored while a previous run is pending (no double
   * submits). Resolves with the result, or `undefined` if it failed; it never
   * rejects, so callers can `await` it without try/catch.
   */
  run: (...args: A) => Promise<R | undefined>;
  pending: boolean;
  /** User-facing error text from the last run, or null. */
  error: string | null;
  /** Clears `error`, e.g. when the user edits the form again. */
  reset: () => void;
};

/**
 * Wraps an async handler with pending/error state, double-submit protection,
 * and screen-reader announcements. Pair `pending` with `<Button pending>` and
 * `error` with `<InlineAlert tone="error">`.
 *
 *   const save = useAsyncAction(() => updateProfile(uid, draft),
 *     { successMessage: "Profile saved" });
 *   <Button label="Save" pending={save.pending} onPress={() => save.run()} />
 */
export function useAsyncAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
  options: AsyncActionOptions<R> = {},
): AsyncAction<A, R> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const latest = useRef({ action, options });
  latest.current = { action, options };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    setError(null);
    const { action: current, options: opts } = latest.current;
    try {
      const result = await current(...args);
      const success =
        typeof opts.successMessage === "function"
          ? opts.successMessage(result)
          : opts.successMessage;
      announce(success);
      opts.onSuccess?.(result);
      return result;
    } catch (caught) {
      const text =
        typeof opts.errorMessage === "function"
          ? opts.errorMessage(caught)
          : (opts.errorMessage ?? describeError(caught));
      if (mounted.current) setError(text);
      if (opts.announceError !== false) announce(text);
      opts.onError?.(caught);
      return undefined;
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
