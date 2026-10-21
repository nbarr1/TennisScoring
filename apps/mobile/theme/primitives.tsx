import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type ScrollViewProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import type { SymbolViewProps } from "expo-symbols";
import { AppIcon, ICON_SIZE } from "../components/AppIcon";
import { announce, hitSlopFor } from "./a11y";
import { makeStyles, useColors } from "./scheme";
import {
  elevations,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  touchTargets,
  typography,
} from "./tokens";

const IS_ANDROID = Platform.OS === "android";

/**
 * How long a button may stay pending before it says so. Firestore writes made
 * offline only resolve once the server acknowledges them, and callables wait
 * about 70 seconds before failing, so a spinner alone can run for minutes.
 */
export const SLOW_PENDING_MS = 10000;

/** True once `busy` has stayed true for `SLOW_PENDING_MS`; announced once. */
function useSlowPending(busy: boolean, speak: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => {
      setSlow(true);
      if (speak)
        announce("Still working. Check your connection if this takes much longer.");
    }, SLOW_PENDING_MS);
    return () => clearTimeout(timer);
  }, [busy, speak]);
  return slow;
}

export function Screen({
  scroll = false,
  contentContainerStyle,
  style,
  children,
  ...props
}: ViewProps & {
  scroll?: boolean;
  contentContainerStyle?: ScrollViewProps["contentContainerStyle"];
}) {
  const styles = useStyles();
  if (scroll)
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        {...(props as ScrollViewProps)}
      >
        {children}
      </ScrollView>
    );
  return (
    <View style={[styles.screen, style]} {...props}>
      {children}
    </View>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const styles = useStyles();
  return <View style={[styles.card, style]} {...props} />;
}

/**
 * `primary` (one per screen), `secondary` (outlined), `danger` (destructive
 * fill, confirm first), `quiet` (text button for low-priority and inline
 * actions). `destructive` and `text` are the original names and still work.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "quiet"
  | "destructive"
  | "text";
type CanonicalVariant = "primary" | "secondary" | "danger" | "quiet";
const canonical = (variant: ButtonVariant): CanonicalVariant =>
  variant === "destructive" ? "danger" : variant === "text" ? "quiet" : variant;

export type ButtonProps = Omit<PressableProps, "children"> & {
  /** Visible text. Also the accessibility label unless one is given. */
  label?: string;
  variant?: ButtonVariant;
  /** Shows a spinner, disables the button, and sets accessibilityState.busy. */
  pending?: boolean;
  /** Same as `pending` (original name). */
  loading?: boolean;
  /** Optional text shown next to the spinner while pending ("Saving…"). */
  pendingLabel?: string;
  /** Leading SF Symbol (mapped to Material Symbols on Android). */
  icon?: SymbolViewProps["name"];
  /**
   * `compact` draws a 36pt-tall button for dense rows and uses hitSlop to
   * keep the touch target at the platform minimum.
   */
  size?: "regular" | "compact";
  fullWidth?: boolean;
  children?: React.ReactNode;
};

export function Button({
  label,
  variant = "primary",
  pending,
  loading,
  pendingLabel,
  icon,
  size = "regular",
  fullWidth = false,
  disabled,
  style,
  children,
  accessibilityLabel,
  accessibilityState,
  hitSlop,
  ...props
}: ButtonProps) {
  const buttonStyles = useButtonStyles();
  const pressedStyles = usePressedStyles();
  const styles = useStyles();
  const kind = canonical(variant);
  const busy = Boolean(pending ?? loading);
  const inactive = Boolean(disabled) || busy;
  // Icon-only buttons have no room for words, so only labelled ones say it.
  const slow = useSlowPending(busy, Boolean(label));
  const busyText = slow && label ? "Still working…" : pendingLabel;
  const compact = size === "compact";
  const variantColors = useVariantColors();
  const fg = variantColors.label[kind];
  const spinner = (
    <ActivityIndicator
      color={fg}
      size="small"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
  const content = children ?? (
    <>
      {icon ? (
        <AppIcon name={icon} size={ICON_SIZE.action} color={fg} />
      ) : null}
      {label ? (
        <Text
          style={[styles.buttonLabel, { color: fg }]}
          numberOfLines={2}
          maxFontSizeMultiplier={1.6}
        >
          {label}
        </Text>
      ) : null}
    </>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{
        ...accessibilityState,
        disabled: inactive,
        busy,
      }}
      disabled={inactive}
      hitSlop={hitSlop ?? (compact ? hitSlopFor(MIN_TOUCH_TARGET, COMPACT_HEIGHT) : undefined)}
      android_ripple={
        inactive ? undefined : { color: variantColors.ripple[kind], foreground: true }
      }
      style={(state) => [
        styles.button,
        compact && styles.buttonCompact,
        fullWidth && styles.fullWidth,
        buttonStyles[kind],
        !IS_ANDROID && state.pressed && !inactive && pressedStyles[kind],
        Boolean(disabled) && !busy && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {busy && busyText ? (
        <>
          {spinner}
          <Text
            style={[styles.buttonLabel, { color: fg }]}
            numberOfLines={2}
            maxFontSizeMultiplier={1.6}
          >
            {busyText}
          </Text>
        </>
      ) : busy ? (
        <>
          {/* Keep the label in layout so the button does not change width. */}
          <View style={styles.hiddenContent}>{content}</View>
          <View style={styles.spinnerOverlay}>{spinner}</View>
        </>
      ) : (
        content
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  icon,
  variant = "text",
  loading,
  pending,
  style,
  ...props
}: Omit<ButtonProps, "label" | "icon"> & {
  /** Required: the accessibility label, since the button has no text. */
  label: string;
  icon: React.ReactNode | SymbolViewProps["name"];
}) {
  const styles = useStyles();
  const variantColors = useVariantColors();
  const kind = canonical(variant);
  const glyph =
    typeof icon === "string" ||
    (icon !== null &&
      typeof icon === "object" &&
      !React.isValidElement(icon) &&
      ("ios" in icon || "android" in icon)) ? (
      <AppIcon
        name={icon as SymbolViewProps["name"]}
        size={ICON_SIZE.tab}
        color={variantColors.label[kind]}
      />
    ) : (
      (icon as React.ReactNode)
    );
  return (
    <Button
      accessibilityLabel={label}
      variant={variant}
      pending={pending ?? loading}
      style={(state) => [
        styles.iconButton,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {glyph}
    </Button>
  );
}

export function TextField({
  label,
  error,
  style,
  multiline,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.fieldWrap}>
      {label && (
        <Text
          style={styles.fieldLabel}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.placeholder}
        multiline={multiline}
        style={[
          styles.field,
          multiline && styles.fieldMultiline,
          error && styles.fieldError,
          style,
        ]}
        accessibilityLabel={props.accessibilityLabel ?? label}
        accessibilityHint={
          props.accessibilityHint ?? (error ? `Error: ${error}` : undefined)
        }
        {...props}
      />
      {error && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  disabled,
  style,
  accessibilityLabel,
  ...props
}: PressableProps & { label: string; selected?: boolean }) {
  const styles = useStyles();
  const variantColors = useVariantColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={Boolean(disabled)}
      android_ripple={{ color: variantColors.chipRipple, foreground: true }}
      style={(state) => [
        styles.chip,
        selected && styles.chipSelected,
        !IS_ANDROID && state.pressed && styles.chipPressed,
        disabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <Text
        style={[styles.chipLabel, selected && styles.chipLabelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  style,
  ...props
}: ViewProps & { title: string; subtitle?: string; action?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.sectionHeader, style]} {...props}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
      </View>
      {action}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  actionLabel,
  onAction,
  style,
  ...props
}: ViewProps & {
  title: string;
  message: string;
  /** An SF Symbol name, or any node. Decorative. */
  icon?: React.ReactNode | SymbolViewProps["name"];
  /** A custom action node. */
  action?: React.ReactNode;
  /** Shorthand for a primary Button: the next step out of the empty state. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.empty, style]} {...props}>
      {typeof icon === "string" ? (
        <AppIcon
          name={icon as SymbolViewProps["name"]}
          size={ICON_SIZE.feature}
          color={colors.textMuted}
        />
      ) : (
        (icon as React.ReactNode)
      )}
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} />
      ) : null}
    </View>
  );
}

/**
 * A failed load, with a way out. Say what failed in `title` and what to do in
 * `message`; `onRetry` adds a "Try again" button.
 */
export function ErrorState({
  title = "Couldn't load this",
  message = "Check your connection, then try again.",
  onRetry,
  retryLabel = "Try again",
  retrying = false,
  style,
  ...props
}: ViewProps & {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  retrying?: boolean;
}) {
  const colors = useColors();
  const styles = useStyles();
  useEffect(() => {
    announce(`${title}. ${message}`);
  }, [title, message]);
  return (
    <View style={[styles.empty, style]} {...props}>
      <AppIcon
        name="exclamationmark.triangle"
        size={ICON_SIZE.feature}
        color={colors.destructive}
      />
      <Text style={styles.emptyTitle} accessibilityRole="header">
        {title}
      </Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {onRetry ? (
        <Button
          label={retryLabel}
          icon="arrow.clockwise"
          variant="secondary"
          pending={retrying}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}

/**
 * A loading placeholder. `label` names what is loading ("Loading matches")
 * and is what screen readers hear. `inline` renders a compact row instead of
 * filling the screen.
 */
export function LoadingState({
  label = "Loading",
  inline = false,
  showLabel,
  style,
  ...props
}: ViewProps & { label?: string; inline?: boolean; showLabel?: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const visible = showLabel ?? !inline;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={[inline ? styles.loadingInline : styles.loading, style]}
      {...props}
    >
      <ActivityIndicator
        color={colors.primary}
        size={inline ? "small" : "large"}
      />
      {visible ? <Text style={styles.loadingLabel}>{label}</Text> : null}
    </View>
  );
}

export type AlertTone = "info" | "success" | "warning" | "error" | "destructive";
const alertIcon: Record<
  Exclude<AlertTone, "destructive">,
  SymbolViewProps["name"]
> = {
  info: "info.circle",
  success: "checkmark.circle",
  warning: "exclamationmark.triangle",
  error: "exclamationmark.circle",
};

/**
 * A tinted message block. Errors and successes are announced to screen
 * readers when they appear or change (`announce` overrides that).
 */
export function InlineAlert({
  title,
  message,
  tone = "info",
  actionLabel,
  onAction,
  announce: shouldAnnounce,
  style,
  ...props
}: ViewProps & {
  title?: string;
  message: string;
  tone?: AlertTone;
  /** An optional quiet button inside the alert ("Try again", "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  announce?: boolean;
}) {
  const alertStyles = useAlertStyles();
  const styles = useStyles();
  const variantColors = useVariantColors();
  const kind = tone === "destructive" ? "error" : tone;
  const speak = shouldAnnounce ?? (kind === "error" || kind === "success");
  useEffect(() => {
    if (speak) announce(title ? `${title}. ${message}` : message);
  }, [speak, title, message]);
  return (
    <View
      accessibilityRole={kind === "error" || kind === "warning" ? "alert" : undefined}
      style={[styles.alert, alertStyles[kind], style]}
      {...props}
    >
      <View style={styles.alertRow}>
        <AppIcon
          name={alertIcon[kind]}
          size={ICON_SIZE.action}
          color={variantColors.alertText[kind]}
        />
        <View style={styles.flex}>
          {title && (
            <Text style={[styles.alertTitle, { color: variantColors.alertText[kind] }]}>
              {title}
            </Text>
          )}
          <Text style={[styles.alertMessage, { color: variantColors.alertText[kind] }]}>
            {message}
          </Text>
        </View>
      </View>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant="quiet"
          size="compact"
          onPress={onAction}
          style={styles.alertAction}
        />
      ) : null}
    </View>
  );
}

const COMPACT_HEIGHT = 36;

/** Label, ripple, and alert text colors per variant, for the current scheme. */
const useVariantColors = makeStyles((colors) => ({
  label: {
    primary: colors.onPrimary,
    secondary: colors.primary,
    danger: colors.onDestructive,
    quiet: colors.primary,
  } as Record<CanonicalVariant, string>,
  ripple: {
    primary: colors.rippleOnFill,
    secondary: colors.rippleStrong,
    danger: colors.rippleOnFill,
    quiet: colors.rippleStrong,
  } as Record<CanonicalVariant, string>,
  chipRipple: colors.rippleStrong,
  alertText: {
    info: colors.info,
    success: colors.successText,
    warning: colors.warningText,
    error: colors.destructive,
  } as Record<Exclude<AlertTone, "destructive">, string>,
}));
const useButtonStyles = makeStyles((colors) =>
  StyleSheet.create({
    primary: { backgroundColor: colors.primary },
    secondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    danger: { backgroundColor: colors.destructive },
    quiet: { backgroundColor: colors.transparent },
  }),
);
const usePressedStyles = makeStyles((colors) =>
  StyleSheet.create({
    primary: { backgroundColor: colors.primaryPressed },
    secondary: { backgroundColor: colors.primarySoft },
    danger: { backgroundColor: colors.destructivePressed },
    quiet: { backgroundColor: colors.primarySoft },
  }),
);
const useAlertStyles = makeStyles((colors) =>
  StyleSheet.create({
    info: { backgroundColor: colors.infoSoft, borderColor: colors.info },
    success: { backgroundColor: colors.successSoft, borderColor: colors.success },
    warning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
    error: {
      backgroundColor: colors.destructiveSoft,
      borderColor: colors.destructive,
    },
  }),
);
const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.canvas },
    screenContent: { flexGrow: 1 },
    flex: { flex: 1 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radii.card,
      padding: spacing.lg,
      ...elevations.low,
    },
    button: {
      minHeight: touchTargets.comfortable,
      minWidth: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radii.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      // Clips the Android ripple to the rounded corners.
      overflow: "hidden",
    },
    buttonCompact: {
      minHeight: COMPACT_HEIGHT,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    fullWidth: { alignSelf: "stretch" },
    buttonLabel: { ...typography.label, textAlign: "center", flexShrink: 1 },
    hiddenContent: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      opacity: 0,
    },
    spinnerOverlay: {
      position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    disabled: { opacity: 0.52 },
    iconButton: {
      width: touchTargets.comfortable,
      minWidth: touchTargets.comfortable,
      paddingHorizontal: 0,
    },
    fieldWrap: { gap: spacing.xs },
    fieldLabel: { ...typography.label, color: colors.text },
    field: {
      minHeight: touchTargets.comfortable,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: spacing.md,
      ...typography.body,
    },
    fieldMultiline: {
      minHeight: 96,
      paddingVertical: spacing.md,
      textAlignVertical: "top",
    },
    fieldError: { borderColor: colors.destructive, borderWidth: 2 },
    errorText: { ...typography.caption, color: colors.destructive, fontWeight: "600" },
    chip: {
      minHeight: MIN_TOUCH_TARGET,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      // A long label ("Intermediate Doubles (yours)") at a large text size
      // truncates inside the row instead of running past the screen edge.
      maxWidth: "100%",
    },
    chipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    chipPressed: { backgroundColor: colors.surfaceMuted },
    chipLabel: { ...typography.label, color: colors.textMuted, flexShrink: 1 },
    chipLabelSelected: { color: colors.primary },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    sectionTitle: { ...typography.heading, color: colors.primary },
    sectionSubtitle: {
      ...typography.caption,
      color: colors.textMuted,
      marginTop: spacing.xs,
    },
    empty: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xxl,
      gap: spacing.sm,
    },
    emptyTitle: {
      ...typography.heading,
      color: colors.text,
      textAlign: "center",
    },
    emptyMessage: {
      ...typography.bodySmall,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: spacing.md,
      maxWidth: 360,
    },
    loading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing.xxl,
      gap: spacing.md,
    },
    loadingInline: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      minHeight: MIN_TOUCH_TARGET,
      gap: spacing.sm,
    },
    loadingLabel: { ...typography.bodySmall, color: colors.textMuted },
    alert: {
      borderLeftWidth: 4,
      borderRadius: radii.sm,
      padding: spacing.md,
      gap: spacing.sm,
    },
    alertRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    alertTitle: { ...typography.label },
    alertMessage: { ...typography.bodySmall },
    alertAction: { alignSelf: "flex-start", marginStart: spacing.xl },
  }),
);

