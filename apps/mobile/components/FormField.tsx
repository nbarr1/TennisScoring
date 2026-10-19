import React, { forwardRef, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import { announce, colors, radii, spacing, typography } from "../theme";

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
      accessibilityHint,
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
      multiline,
      placeholderTextColor,
      ...props
    },
    ref,
  ) {
    const [focused, setFocused] = useState(false);
    const description = error || helperText;
    // The visible label is hidden from screen readers and folded into the
    // input's own label, so VoiceOver/TalkBack read "Email, required, text
    // field" once instead of stopping on the label and the field separately.
    const spokenLabel =
      (accessibilityLabel ?? label) + (required ? ", required" : "");
    const spokenHint =
      accessibilityHint ??
      (error
        ? `Error: ${error}${helperText ? `. ${helperText}` : ""}`
        : helperText);

    // Announce a new error while the user is in this field (live validation).
    // Errors that appear on submit are announced once by FormErrorSummary, so
    // unfocused fields stay quiet. Android uses the live region below instead.
    useEffect(() => {
      if (focused && error && Platform.OS === "ios") announce(error);
      // Only a change of error text should speak, not a focus change.
    }, [error]);

    return (
      <View style={[styles.container, containerStyle]}>
        <Text
          style={[styles.label, disabled && styles.disabledText]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        <TextInput
          ref={ref}
          {...props}
          value={value}
          maxLength={maxLength}
          multiline={multiline}
          accessibilityLabel={spokenLabel}
          accessibilityHint={spokenHint}
          accessibilityState={{ disabled }}
          aria-invalid={!!error}
          editable={editable ?? !disabled}
          placeholderTextColor={placeholderTextColor ?? colors.placeholder}
          style={[
            styles.input,
            multiline && styles.multiline,
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
              // The input's hint already carries this text; the live region
              // re-reads it on Android only when it changes during typing.
              accessibilityLiveRegion={error && focused ? "polite" : "none"}
              importantForAccessibility={error && focused ? "yes" : "no"}
              accessibilityElementsHidden={!(error && focused)}
              style={[styles.helper, error && styles.errorText]}
            >
              {description ?? " "}
            </Text>
            {showCharacterCount && (
              <Text
                style={styles.count}
                accessibilityLabel={`${value?.length ?? 0}${
                  maxLength ? ` of ${maxLength}` : ""
                } characters`}
              >
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

/**
 * The list of problems blocking a submit. Announced to screen readers when it
 * appears or its contents change.
 */
export function FormErrorSummary({ errors }: { errors: string[] }) {
  const key = errors.join("\n");
  useEffect(() => {
    if (!errors.length) return;
    announce(
      `${errors.length === 1 ? "1 problem" : `${errors.length} problems`} to fix. ${errors.join(". ")}`,
    );
    // `key` stands in for `errors`, which is a new array on every render.
  }, [key]);
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
  multiline: { minHeight: 96, textAlignVertical: "top" },
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
