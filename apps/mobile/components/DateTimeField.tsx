import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import {
  announce,
  radii,
  spacing,
  typography,
  useColors,
  useColorSchemeName,
  makeStyles,
} from "../theme";

export type DateTimeFieldMode = "date" | "time";

export type DateTimeFieldHandle = {
  /** Moves screen-reader focus to the field, for focus-on-error. */
  focus: () => void;
};

export type DateTimeFieldProps = {
  label: string;
  mode: DateTimeFieldMode;
  /**
   * `YYYY-MM-DD` for a date, 24-hour `HH:MM` for a time, or "" when nothing
   * has been chosen. Forms keep validating these strings as before; only the
   * input changed.
   */
  value: string;
  onChange: (value: string) => void;
  /** What the picker opens on when `value` is empty. */
  defaultValue?: string;
  minimumDate?: Date;
  placeholder?: string;
  accessibilityLabel?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  containerStyle?: ViewStyle;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toFieldValue(date: Date, mode: DateTimeFieldMode): string {
  return mode === "date"
    ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a field value into a Date, or null when it isn't one. */
export function fromFieldValue(
  value: string,
  mode: DateTimeFieldMode,
): Date | null {
  const trimmed = value.trim();
  if (mode === "date") {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day, 12, 0, 0, 0);
    return date.getMonth() === month - 1 ? date : null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const [hours, minutes] = match.slice(1).map(Number);
  if (hours > 23 || minutes > 59) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The value in the reader's locale: "Sat, Oct 24, 2026" or "6:30 PM". */
export function formatFieldValue(
  value: string,
  mode: DateTimeFieldMode,
): string | null {
  const date = fromFieldValue(value, mode);
  if (!date) return null;
  return mode === "date"
    ? date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
}

/**
 * A form field that uses the system date or time picker. Android opens the
 * platform dialog from a field styled like the app's text inputs. iOS uses the
 * compact picker, the button that opens the calendar or time wheel over the
 * screen, so it needs no room in the form. An empty field shows a placeholder
 * until the first tap gives it a value.
 */
export const DateTimeField = forwardRef<DateTimeFieldHandle, DateTimeFieldProps>(
  function DateTimeField(
    {
      label,
      mode,
      value,
      onChange,
      defaultValue,
      minimumDate,
      placeholder,
      accessibilityLabel,
      error,
      helperText,
      required = false,
      containerStyle,
    },
    ref,
  ) {
    const colors = useColors();
    const scheme = useColorSchemeName();
    const styles = useStyles();
    const fieldRef = useRef<View>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        if (fieldRef.current) {
          AccessibilityInfo.sendAccessibilityEvent(fieldRef.current, "focus");
        }
      },
    }));

    const formatted = formatFieldValue(value, mode);
    const initial =
      fromFieldValue(value, mode) ??
      (defaultValue ? fromFieldValue(defaultValue, mode) : null) ??
      new Date();
    const description = error || helperText;
    const spokenLabel =
      (accessibilityLabel ?? label) + (required ? ", required" : "");
    const emptyText =
      placeholder ?? (mode === "date" ? "Choose a date" : "Choose a time");

    const open = () => {
      if (Platform.OS === "android") {
        DateTimePickerAndroid.open({
          value: initial,
          mode,
          minimumDate,
          onValueChange: (_event, date) => onChange(toFieldValue(date, mode)),
        });
        return;
      }
      // iOS: the compact picker needs a value to show, so the first tap sets
      // one and the picker takes the field's place.
      const next = toFieldValue(initial, mode);
      onChange(next);
      announce(
        `${accessibilityLabel ?? label} set to ${formatFieldValue(next, mode)}. Use the ${mode} button to change it.`,
      );
    };

    return (
      <View style={[styles.container, containerStyle]}>
        <Text
          style={styles.label}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
        {Platform.OS === "ios" && formatted ? (
          <View
            ref={fieldRef}
            style={[styles.iosPicker, !!error && styles.errorInput]}
          >
            <DateTimePicker
              value={initial}
              mode={mode}
              display="compact"
              minimumDate={minimumDate}
              accentColor={colors.primary}
              themeVariant={scheme}
              onValueChange={(_event, date) =>
                onChange(toFieldValue(date, mode))
              }
            />
          </View>
        ) : (
          <Pressable
            ref={fieldRef}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={`${spokenLabel}, ${formatted ?? "not set"}`}
            accessibilityHint={
              error
                ? `Error: ${error}${helperText ? `. ${helperText}` : ""}`
                : (helperText ?? `Opens the ${mode} picker`)
            }
            aria-invalid={!!error}
            style={({ pressed }) => [
              styles.input,
              pressed && styles.focused,
              !!error && styles.errorInput,
            ]}
          >
            <Text style={formatted ? styles.valueText : styles.placeholderText}>
              {formatted ?? emptyText}
            </Text>
          </Pressable>
        )}
        {description ? (
          <Text
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.helper, !!error && styles.errorText]}
          >
            {description}
          </Text>
        ) : null}
      </View>
    );
  },
);

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    container: { gap: spacing.xs },
    label: { color: colors.text, ...typography.label },
    required: { color: colors.destructive },
    input: {
      backgroundColor: colors.surface,
      borderColor: colors.borderStrong,
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      padding: spacing.md,
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
    valueText: { color: colors.text, ...typography.body },
    placeholderText: { color: colors.placeholder, ...typography.body },
    iosPicker: {
      alignItems: "flex-start",
      borderColor: "transparent",
      borderRadius: radii.md,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
    },
    helper: { color: colors.textMuted, ...typography.caption },
    errorText: { color: colors.destructive, fontWeight: "600" },
  }),
);
