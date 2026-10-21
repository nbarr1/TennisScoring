"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { Button } from "./Button";
import { LoadingBlock } from "./motion";
import { color, radius, space, type } from "./tokens";
import { describeError } from "./useAsyncAction";

export { LoadingBlock };

/**
 * What a state's title renders as. A state that stands in for a whole page (a
 * dead link, a failed load) passes 1 so the page still has a heading; one
 * inside a section keeps the default paragraph.
 */
export type StateHeadingLevel = 1 | 2 | 3;

function StateTitle({ level, style, children }: { level?: StateHeadingLevel; style: CSSProperties; children: ReactNode }) {
  // Body face either way: globals.css gives h1-h3 the display face.
  if (!level) return <p style={style}>{children}</p>;
  const Heading = `h${level}` as const;
  return <Heading style={{ fontFamily: "var(--font-body)", letterSpacing: "normal", ...style }}>{children}</Heading>;
}

/**
 * What a list or section shows when there is genuinely nothing in it. Say
 * what would appear here and give the next step as `action`.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  headingLevel,
  style,
}: {
  /** Decorative Tabler icon, e.g. <IconCalendar size={32} aria-hidden="true" />. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Smaller padding, for a section inside a page rather than a whole page. */
  compact?: boolean;
  /** Render the title as a heading of this level instead of a paragraph. */
  headingLevel?: StateHeadingLevel;
  style?: CSSProperties;
}): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: space.sm,
        padding: compact ? space.xl : space.xxl,
        color: color.textMuted,
        ...style,
      }}
    >
      {icon && <div style={{ color: color.textSubtle, marginBottom: space.xs }}>{icon}</div>}
      <StateTitle level={headingLevel} style={{ ...type.label, fontSize: 16, color: color.ink }}>
        {title}
      </StateTitle>
      {description && <p style={{ ...type.bodySmall, maxWidth: "48ch" }}>{description}</p>}
      {action && <div style={{ marginTop: space.sm, display: "flex", flexWrap: "wrap", gap: space.sm, justifyContent: "center" }}>{action}</div>}
    </div>
  );
}

/**
 * What a section shows when its data failed to load, so a failure never reads
 * as an empty list. role="alert" announces it when it appears.
 */
export function ErrorState({
  title = "Couldn't load this.",
  error,
  message,
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  compact = false,
  headingLevel,
  style,
}: {
  title?: ReactNode;
  /** The caught error; turned into a sentence with `describeError`. */
  error?: unknown;
  /** Explicit message, used instead of `error`. */
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
  compact?: boolean;
  /** Render the title as a heading of this level instead of a paragraph. */
  headingLevel?: StateHeadingLevel;
  style?: CSSProperties;
}): React.JSX.Element {
  const body =
    message ?? (error ? describeError(error, "Check your connection and try again.") : "Check your connection and try again.");
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: space.sm,
        padding: compact ? space.xl : space.xxl,
        borderRadius: radius.card,
        background: color.destructiveSoft,
        color: color.destructivePressed,
        ...style,
      }}
    >
      <IconAlertCircle size={28} aria-hidden="true" />
      <StateTitle level={headingLevel} style={{ ...type.label, fontSize: 16 }}>
        {title}
      </StateTitle>
      <p style={{ ...type.bodySmall, maxWidth: "48ch" }}>{body}</p>
      {onRetry && (
        <Button
          variant="secondary"
          onClick={onRetry}
          pending={retrying}
          pendingLabel="Retrying…"
          icon={<IconRefresh size={18} aria-hidden="true" />}
          style={{ marginTop: space.xs }}
        >
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Picks loading, error, empty, or content in that order, so pages cannot
 * accidentally show "No matches yet" while a query failed or is still
 * running.
 *
 *   <DataState loading={loading} error={error} isEmpty={matches.length === 0}
 *     loadingLabel="Loading matches" errorTitle="Couldn't load matches." onRetry={reload}
 *     empty={<EmptyState title="No matches yet" />}>
 *     {matches.map(...)}
 *   </DataState>
 */
export function DataState({
  loading,
  error,
  isEmpty,
  loadingLabel,
  loadingRows,
  errorTitle,
  onRetry,
  empty,
  children,
}: {
  loading: boolean;
  error?: unknown;
  isEmpty: boolean;
  loadingLabel: string;
  loadingRows?: number;
  errorTitle?: ReactNode;
  onRetry?: () => void;
  empty: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  if (error) return <ErrorState title={errorTitle} error={error} onRetry={onRetry} compact />;
  if (loading) return <LoadingBlock label={loadingLabel} rows={loadingRows} />;
  if (isEmpty) return <>{empty}</>;
  return <>{children}</>;
}
