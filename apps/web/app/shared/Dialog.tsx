"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";
import { Button } from "./Button";
import { color, radius, space, type, width as widths } from "./tokens";

export type DialogSize = "sm" | "md" | "lg";

const SIZE_WIDTH: Record<DialogSize, number> = {
  sm: 440,
  md: widths.dialog + 60,
  lg: widths.reading,
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute("inert") && element.getClientRects().length > 0,
  );
}

// Open dialogs, innermost last. Only the top one handles Escape and Tab, so a
// confirm opened from inside a dialog does not also close its parent.
const dialogStack: string[] = [];

// Body scroll lock shared by nested dialogs.
let scrollLocks = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lockScroll() {
  if (scrollLocks === 0) {
    const body = document.body;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

type DialogContextValue = {
  /** Close the dialog the same way Escape does, asking first when `dirty`. */
  requestClose: () => void;
  titleId: string;
};

// useLayoutEffect warns during server rendering; the dialog only ever opens in
// the browser, so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const DialogContext = createContext<DialogContextValue | null>(null);

/**
 * Inside a `<Dialog>`, returns `requestClose()`. Wire your own Cancel button
 * to it so Cancel also asks "Discard your changes?" when the form is dirty.
 */
export function useDialogClose(): () => void {
  const context = useContext(DialogContext);
  return context?.requestClose ?? (() => undefined);
}

export type DialogProps = {
  open: boolean;
  /** Called after the user dismisses the dialog (and confirmed discarding, if dirty). */
  onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  title: ReactNode;
  /** Optional line under the title, linked with aria-describedby. */
  description?: ReactNode;
  children?: ReactNode;
  /** Action row pinned under the scrolling body (e.g. Cancel + Save). */
  footer?: ReactNode;
  /**
   * When true, Escape, the close button, an overlay click, and
   * `useDialogClose()` ask "Discard your changes?" before closing.
   */
  dirty?: boolean;
  /** Element to focus on open. Defaults to the first `[data-autofocus]`, then the first field or button in the body. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  size?: DialogSize;
  /** Set false while a save is running so the dialog cannot be dismissed mid-write. */
  dismissible?: boolean;
  /** Hide the top-right close button (Escape and overlay still work). */
  hideCloseButton?: boolean;
  closeLabel?: string;
  /** "alertdialog" for confirmations that interrupt. */
  role?: "dialog" | "alertdialog";
  panelStyle?: CSSProperties;
};

/**
 * Accessible modal dialog: role="dialog", aria-modal, labelled by its title,
 * focus moved in on open and trapped, Escape closes, focus returns to the
 * opener on close, body scroll is locked, and an overlay click closes. When
 * `dirty`, every dismissal first asks an in-dialog "Discard your changes?".
 * Under 600px wide it becomes a full-width bottom sheet.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dirty = false,
  initialFocusRef,
  size = "md",
  dismissible = true,
  hideCloseButton = false,
  closeLabel = "Close",
  role = "dialog",
  panelStyle,
}: DialogProps): React.JSX.Element | null {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const panelRef = useRef<HTMLDivElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const pointerDownOnOverlay = useRef(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [mounted, setMounted] = useState(false);

  const latest = useRef({ dirty, dismissible, onClose, confirmingDiscard });
  latest.current = { dirty, dismissible, onClose, confirmingDiscard };

  useEffect(() => setMounted(true), []);

  const requestClose = useCallback(() => {
    const state = latest.current;
    if (!state.dismissible) return;
    if (state.dirty) {
      setConfirmingDiscard(true);
      return;
    }
    state.onClose();
  }, []);

  // Open/close lifecycle: remember the opener, lock scroll, register on the
  // stack, and restore focus on close.
  useIsomorphicLayoutEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(id);
    lockScroll();
    return () => {
      const index = dialogStack.lastIndexOf(id);
      if (index >= 0) dialogStack.splice(index, 1);
      unlockScroll();
      setConfirmingDiscard(false);
      const opener = openerRef.current;
      // Defer so the opener is focusable again once the dialog unmounts.
      window.setTimeout(() => {
        if (opener && opener.isConnected) opener.focus();
      }, 0);
    };
  }, [open, id]);

  // Initial focus.
  useEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    const explicit = initialFocusRef?.current;
    const marked = panel.querySelector<HTMLElement>("[data-autofocus]");
    const body = panel.querySelector<HTMLElement>("[data-dialog-body]");
    const first = body ? focusableWithin(body)[0] : undefined;
    (explicit ?? marked ?? first ?? panel).focus();
    // Only on open; later re-renders must not steal focus.
  }, [open, mounted]);

  // Focus the safe choice when the discard question appears.
  useEffect(() => {
    if (confirmingDiscard) keepEditingRef.current?.focus();
  }, [confirmingDiscard]);

  // Escape and Tab trap, only for the top-most dialog.
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      if (dialogStack[dialogStack.length - 1] !== id) return;
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (latest.current.confirmingDiscard) {
          setConfirmingDiscard(false);
          return;
        }
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusableWithin(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstItem || active === panel || !panel.contains(active))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (active === lastItem || !panel.contains(active))) {
        event.preventDefault();
        firstItem.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, id, requestClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <DialogContext.Provider value={{ requestClose, titleId }}>
      <div
        className="tl-dialog-overlay"
        onMouseDown={(event) => {
          pointerDownOnOverlay.current = event.target === event.currentTarget;
        }}
        onClick={(event) => {
          // Only a press that started and ended on the overlay dismisses, so a
          // text selection dragged out of a field does not close the dialog.
          if (event.target === event.currentTarget && pointerDownOnOverlay.current) requestClose();
          pointerDownOnOverlay.current = false;
        }}
      >
        <div
          ref={panelRef}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className="tl-dialog-panel"
          style={{ maxWidth: SIZE_WIDTH[size], ...panelStyle }}
        >
          <div style={styles.header}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id={titleId} style={styles.title}>
                {title}
              </h2>
              {description && (
                <p id={descriptionId} style={styles.description}>
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={requestClose}
                aria-label={closeLabel}
                disabled={!dismissible}
                style={styles.closeButton}
              >
                <IconX size={22} aria-hidden="true" />
              </button>
            )}
          </div>

          {confirmingDiscard ? (
            <div role="group" aria-labelledby={`${id}-discard`} style={styles.discard}>
              <p id={`${id}-discard`} style={styles.discardTitle}>
                Discard your changes?
              </p>
              <p style={styles.discardBody}>What you entered in this form will be lost.</p>
              <div style={styles.discardActions}>
                <Button ref={keepEditingRef} variant="secondary" onClick={() => setConfirmingDiscard(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setConfirmingDiscard(false);
                    latest.current.onClose();
                  }}
                >
                  Discard changes
                </Button>
              </div>
            </div>
          ) : null}

          {/* The form stays mounted (hidden) while the discard question shows,
              so "Keep editing" returns to exactly what was entered. */}
          <div className="tl-dialog-body" data-dialog-body hidden={confirmingDiscard}>
            {children}
          </div>
          {footer && !confirmingDiscard && <div className="tl-dialog-footer">{footer}</div>}
        </div>
      </div>
    </DialogContext.Provider>,
    document.body,
  );
}

const styles = {
  header: {
    display: "flex",
    alignItems: "flex-start",
    gap: space.sm,
    padding: "20px 16px 12px 24px",
  },
  title: {
    ...type.headline,
    color: color.clubhouseGreen,
    overflowWrap: "anywhere",
  },
  description: {
    ...type.bodySmall,
    color: color.textMuted,
    marginTop: space.xs,
  },
  closeButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 44,
    marginTop: -6,
    background: "transparent",
    border: "none",
    borderRadius: radius.md,
    color: color.textMuted,
    flexShrink: 0,
  },
  discard: {
    padding: "8px 24px 24px",
  },
  discardTitle: { ...type.title, color: color.ink },
  discardBody: { ...type.bodySmall, color: color.textMuted, marginTop: space.xs },
  discardActions: {
    display: "flex",
    flexWrap: "wrap-reverse",
    justifyContent: "flex-end",
    gap: space.md,
    marginTop: space.lg,
  },
} satisfies Record<string, CSSProperties>;
