import React, { forwardRef, useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

export type FormFieldProps = TextInputProps & {
  label: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  showCharacterCount?: boolean;
  containerStyle?: ViewStyle;
  inputStyle?: TextStyle | TextStyle[];
};

/** A consistently labelled, accessible text field for mobile forms. */
export const FormField = forwardRef<TextInput, FormFieldProps>(
  function FormField(
    {
      label,
      accessibilityLabel,
      error,
      helperText,
      required = false,
      disabled = false,
      showCharacterCount = false,
      containerStyle,
      inputStyle,
      onFocus,
      onBlur,
      value,
      maxLength,
      editable,
      ...props
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const description = error || helperText;

    return (
      <View style={[styles.container, containerStyle]}>
        <Text style={[styles.label, disabled && styles.disabledText]}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <TextInput
          ref={ref}
          {...props}
          value={value}
          maxLength={maxLength}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={description}
          accessibilityState={{ disabled }}
          aria-invalid={!!error}
          editable={editable ?? !disabled}
          style={[
            styles.input,
            focused && styles.focused,
            error && styles.errorInput,
            disabled && styles.disabledInput,
            inputStyle,
          ]}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {(description || showCharacterCount) && (
          <View style={styles.metaRow}>
            <Text
              accessibilityLiveRegion={error ? "polite" : "none"}
              style={[styles.helper, error && styles.errorText]}
            >
              {description ?? " "}
            </Text>
            {showCharacterCount && (
              <Text style={styles.count}>
                {(value?.length ?? 0).toLocaleString()}
                {maxLength ? ` / ${maxLength}` : ""}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  },
);

export function FormErrorSummary({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <View accessibilityRole="alert" style={styles.summary}>
      <Text style={styles.summaryTitle}>Please fix the following:</Text>
      {errors.map((error) => (
        <Text key={error} style={styles.summaryText}>
          • {error}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { color: colors.text, ...typography.label },
  required: { color: colors.destructive },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    color: colors.text,
    minHeight: 48,
    padding: spacing.md,
    ...typography.body,
  },
  focused: {
    borderColor: colors.primary,
    borderWidth: 2,
    padding: spacing.md - 1,
  },
  errorInput: {
    borderColor: colors.destructive,
    borderWidth: 2,
    padding: spacing.md - 1,
  },
  disabledInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.disabledText,
  },
  disabledText: { color: colors.disabledText },
  metaRow: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  helper: { color: colors.textMuted, flex: 1, ...typography.caption },
  errorText: { color: colors.destructive, fontWeight: "600" },
  count: { color: colors.textMuted, ...typography.caption },
  summary: {
    backgroundColor: colors.destructiveSoft,
    borderColor: colors.destructive,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 3,
    padding: spacing.md,
  },
  summaryTitle: {
    color: colors.destructive,
    ...typography.label,
    fontWeight: "700",
  },
  summaryText: { color: colors.destructive, ...typography.bodySmall },
});
