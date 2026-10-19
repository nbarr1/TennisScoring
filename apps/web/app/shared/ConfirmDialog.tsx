"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { InlineAlert } from "./InlineAlert";
import { color, type } from "./tokens";
import { describeError } from "./useAsyncAction";

export type ConfirmTone = "danger" | "primary";

export type ConfirmDialogProps = {
  open: boolean;
  /** A question naming the action: "Decline Ann's proposal?" */
  title: ReactNode;
  /** What happens, and whether it can be undone. */
  message?: ReactNode;
  /** The verb on the confirm button: "Decline proposal", never "OK". */
  confirmLabel: string;
  /** Label while `onConfirm` runs, e.g. "Declining…". */
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /**
   * Runs on confirm. If it returns a promise, the dialog shows a pending
   * state and, if the promise rejects, stays open with the error shown. The
   * dialog never closes itself: set `open` to false (usually at the end of
   * `onConfirm`, once the write succeeded).
   */
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
};

/**
 * Confirmation for destructive or consequential actions. Focus starts on
 * Cancel for destructive confirms, so an Enter press never destroys anything.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = useCallback(() => {
    setError(null);
    onCancel();
  }, [onCancel]);

  async function handleConfirm() {
    if (pending) return;
    setError(null);
    try {
      const result = onConfirm();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        setPending(true);
        await result;
      }
    } catch (caught) {
      setError(describeError(caught));
      return;
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={title}
      size="sm"
      role="alertdialog"
      dismissible={!pending}
      initialFocusRef={tone === "danger" ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={close} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={tone === "danger" ? "danger" : "primary"}
            pending={pending}
            pendingLabel={pendingLabel}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <div style={{ ...type.body, color: color.ink }}>{message}</div>}
      {error && <InlineAlert tone="error" style={{ marginTop: 12 }}>{error}</InlineAlert>}
    </Dialog>
  );
}

type ConfirmOptions = Omit<ConfirmDialogProps, "open" | "onConfirm" | "onCancel">;

/**
 * Promise-based confirm, for replacing `window.confirm`:
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (await confirm({ title: "Remove Ann from the roster?", confirmLabel: "Remove player" })) { ... }
 *   return <>{...}{confirmDialog}</>;
 *
 * Render `confirmDialog` once anywhere in the component. The promise resolves
 * true on confirm and false on cancel, Escape, or overlay click.
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmDialog: React.JSX.Element;
} {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    [],
  );

  const settle = (value: boolean) => {
    request?.resolve(value);
    setRequest(null);
  };

  const confirmDialog = (
    <ConfirmDialog
      open={request !== null}
      title={request?.title ?? ""}
      message={request?.message}
      confirmLabel={request?.confirmLabel ?? "Confirm"}
      cancelLabel={request?.cancelLabel}
      tone={request?.tone}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, confirmDialog };
}
