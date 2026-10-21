"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, CSSProperties, MouseEvent, ReactNode } from "react";
import { color, radius, target, type } from "./tokens";

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet" | "quiet-danger";
export type ButtonSize = "md" | "sm";

const VARIANT_STYLES: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: color.brandFill,
    color: color.onBrand,
    border: "1px solid transparent",
  },
  secondary: {
    background: color.surface,
    color: color.clubhouseGreen,
    border: `1px solid ${color.clubhouseGreen}`,
  },
  danger: {
    background: color.destructiveFill,
    color: color.onBrand,
    border: "1px solid transparent",
  },
  quiet: {
    background: "transparent",
    color: color.clubhouseGreen,
    border: "1px solid transparent",
  },
  "quiet-danger": {
    background: "transparent",
    color: color.destructivePressed,
    border: "1px solid transparent",
  },
};

/**
 * The inline style for a button of the given variant, for elements that
 * cannot be a `<Button>` (a `<Link>` styled as a button, a `<label>` for a
 * file input). Pair it with `buttonClassName(variant)` for the hover and
 * press states.
 */
export function buttonStyle(
  variant: ButtonVariant = "primary",
  options: { size?: ButtonSize; fullWidth?: boolean; disabled?: boolean } = {},
): CSSProperties {
  const { size = "md", fullWidth = false, disabled = false } = options;
  return {
    ...type.label,
    ...VARIANT_STYLES[variant],
    display: fullWidth ? "flex" : "inline-flex",
    width: fullWidth ? "100%" : undefined,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: size === "md" ? target.control : target.min,
    minWidth: target.min,
    padding: size === "md" ? "12px 16px" : "8px 12px",
    borderRadius: radius.md,
    textAlign: "center",
    textDecoration: "none",
    whiteSpace: "normal",
    opacity: disabled ? 0.55 : 1,
  };
}

export function buttonClassName(variant: ButtonVariant = "primary", extra?: string): string {
  return ["tl-btn", `tl-btn--${variant}`, extra].filter(Boolean).join(" ");
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy, and ignores further clicks. */
  pending?: boolean;
  /** Label while pending, e.g. "Saving…". Defaults to the normal label. */
  pendingLabel?: ReactNode;
  /** Optional leading icon (decorative; give it aria-hidden). */
  icon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
};

/**
 * The app's button: primary (Clubhouse Green), secondary (outlined), danger
 * (Destructive Red), quiet (text only) and quiet-danger (red text only).
 *
 * `type` defaults to "button" so a button inside a form never submits it by
 * accident; pass `type="submit"` for the form's submit button.
 *
 * While `pending`, the button stays focusable (so keyboard focus is not
 * thrown to the page) but is `aria-disabled`, and clicks and submits are
 * swallowed, which prevents double submission.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    pending = false,
    pendingLabel,
    icon,
    fullWidth = false,
    disabled,
    type: buttonType = "button",
    className,
    style,
    onClick,
    children,
    ...rest
  },
  ref,
) {
  const inert = pending || disabled;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      ref={ref}
      type={buttonType}
      disabled={disabled && !pending}
      aria-disabled={inert || undefined}
      aria-busy={pending || undefined}
      className={buttonClassName(variant, className)}
      style={{ ...buttonStyle(variant, { size, fullWidth, disabled: inert }), ...style }}
      onClick={handleClick}
      {...rest}
    >
      {pending ? <span className="tl-spinner" aria-hidden="true" /> : icon}
      <span>{pending && pendingLabel ? pendingLabel : children}</span>
    </button>
  );
});

/** A standalone spinner, for places that are working but have no button. */
export function Spinner({ label, size = 16 }: { label?: string; size?: number }): React.JSX.Element {
  return (
    <span role={label ? "status" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span className="tl-spinner" aria-hidden="true" style={{ width: size, height: size }} />
      {label && <span>{label}</span>}
    </span>
  );
}
