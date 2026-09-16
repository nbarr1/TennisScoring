import React from "react";
import {
  ActivityIndicator,
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
import {
  colors,
  elevations,
  radii,
  spacing,
  touchTargets,
  typography,
} from "./tokens";

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
  if (scroll)
    return (
      <ScrollView
        style={[styles.screen, style]}
        contentContainerStyle={[styles.screenContent, contentContainerStyle]}
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
  return <View style={[styles.card, style]} {...props} />;
}

export type ButtonVariant = "primary" | "secondary" | "destructive" | "text";
export function Button({
  label,
  variant = "primary",
  loading = false,
  disabled,
  style,
  children,
  ...props
}: PressableProps & {
  label?: string;
  variant?: ButtonVariant;
  loading?: boolean;
}) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inactive), busy: loading }}
      disabled={Boolean(inactive)}
      style={(state) => [
        styles.button,
        buttonStyles[variant],
        state.pressed && !inactive && pressedStyles[variant],
        inactive && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === "secondary" || variant === "text"
              ? colors.primary
              : colors.onPrimary
          }
        />
      ) : (
        (children ?? (
          <Text
            style={[
              styles.buttonLabel,
              labelStyles[variant],
              inactive && styles.disabledLabel,
            ]}
          >
            {label}
          </Text>
        ))
      )}
    </Pressable>
  );
}

export function IconButton({
  label,
  icon,
  variant = "text",
  loading,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "label"> & {
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Button
      accessibilityLabel={label}
      variant={variant}
      loading={loading}
      style={styles.iconButton}
      {...props}
    >
      {icon}
    </Button>
  );
}

export function TextField({
  label,
  error,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string }) {
  return (
    <View style={styles.fieldWrap}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={colors.textSubtle}
        style={[styles.field, error && styles.fieldError, style]}
        accessibilityLabel={props.accessibilityLabel ?? label}
        {...props}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  disabled,
  style,
  ...props
}: PressableProps & { label: string; selected?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      disabled={Boolean(disabled)}
      style={(state) => [
        styles.chip,
        selected && styles.chipSelected,
        state.pressed && styles.chipPressed,
        disabled && styles.disabled,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
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
  return (
    <View style={[styles.sectionHeader, style]} {...props}>
      <View style={styles.flex}>
        <Text style={styles.sectionTitle}>{title}</Text>
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
  style,
  ...props
}: ViewProps & {
  title: string;
  message: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={[styles.empty, style]} {...props}>
      {icon}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
      {action}
    </View>
  );
}

export function InlineAlert({
  title,
  message,
  tone = "info",
  style,
  ...props
}: ViewProps & {
  title?: string;
  message: string;
  tone?: "info" | "success" | "warning" | "destructive";
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[styles.alert, alertStyles[tone], style]}
      {...props}
    >
      {title && (
        <Text style={[styles.alertTitle, alertTextStyles[tone]]}>{title}</Text>
      )}
      <Text style={[styles.alertMessage, alertTextStyles[tone]]}>
        {message}
      </Text>
    </View>
  );
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  destructive: { backgroundColor: colors.destructive },
  text: { backgroundColor: colors.transparent },
});
const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.primarySoft },
  destructive: { backgroundColor: colors.destructivePressed },
  text: { backgroundColor: colors.primarySoft },
});
const labelStyles = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.primary },
  destructive: { color: colors.onPrimary },
  text: { color: colors.primary },
});
const alertStyles = StyleSheet.create({
  info: { backgroundColor: colors.infoSoft, borderColor: colors.info },
  success: { backgroundColor: colors.successSoft, borderColor: colors.success },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warning },
  destructive: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
  },
});
const alertTextStyles = StyleSheet.create({
  info: { color: colors.info },
  success: { color: colors.primary },
  warning: { color: "#7A410D" },
  destructive: { color: colors.destructive },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  screenContent: { flexGrow: 1 },
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.lg,
    ...elevations.low,
  },
  button: {
    minHeight: touchTargets.comfortable,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  buttonLabel: { ...typography.label },
  disabled: { opacity: 0.52 },
  disabledLabel: { color: colors.disabledText },
  iconButton: { width: touchTargets.comfortable, paddingHorizontal: 0 },
  fieldWrap: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.text },
  field: {
    minHeight: touchTargets.comfortable,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    ...typography.body,
  },
  fieldError: { borderColor: colors.destructive },
  errorText: { ...typography.caption, color: colors.destructive },
  chip: {
    minHeight: touchTargets.minimum,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  chipPressed: { backgroundColor: colors.surfaceMuted },
  chipLabel: { ...typography.label, color: colors.textMuted },
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
    color: colors.textSubtle,
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
  },
  alert: {
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  alertTitle: { ...typography.label },
  alertMessage: { ...typography.bodySmall },
});
