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
  container: { gap: 6 },
  label: { color: "#444", fontSize: 14, fontWeight: "600" },
  required: { color: "#b42318" },
  input: {
    backgroundColor: "#fff",
    borderColor: "#b8b8b8",
    borderRadius: 10,
    borderWidth: 1,
    color: "#111",
    fontSize: 15,
    padding: 12,
  },
  focused: { borderColor: "#1a472a", borderWidth: 2, padding: 11 },
  errorInput: { borderColor: "#b42318", borderWidth: 2, padding: 11 },
  disabledInput: { backgroundColor: "#eee", color: "#777" },
  disabledText: { color: "#777" },
  metaRow: { flexDirection: "row", gap: 8, justifyContent: "space-between" },
  helper: { color: "#666", flex: 1, fontSize: 12, lineHeight: 17 },
  errorText: { color: "#b42318", fontWeight: "600" },
  count: { color: "#666", fontSize: 12 },
  summary: {
    backgroundColor: "#fff1f0",
    borderColor: "#b42318",
    borderRadius: 10,
    borderWidth: 1,
    gap: 3,
    padding: 12,
  },
  summaryTitle: { color: "#8a1c13", fontSize: 14, fontWeight: "700" },
  summaryText: { color: "#8a1c13", fontSize: 13 },
});
