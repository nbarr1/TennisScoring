import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";

type KeyboardSafeViewProps = Omit<KeyboardAvoidingViewProps, "behavior"> & {
  behavior?: KeyboardAvoidingViewProps["behavior"];
};

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  keyboardViewStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
};

const DEFAULT_KEYBOARD_BEHAVIOR: KeyboardAvoidingViewProps["behavior"] =
  Platform.OS === "ios" ? "padding" : "height";

export function KeyboardSafeView({
  children,
  style,
  keyboardVerticalOffset = 0,
  behavior = DEFAULT_KEYBOARD_BEHAVIOR,
  ...props
}: KeyboardSafeViewProps) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...props}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

export function KeyboardAwareScrollView({
  children,
  keyboardViewStyle,
  keyboardVerticalOffset = 0,
  keyboardShouldPersistTaps = "handled",
  keyboardDismissMode = Platform.OS === "ios" ? "interactive" : "on-drag",
  ...scrollViewProps
}: KeyboardAwareScrollViewProps) {
  return (
    <KeyboardSafeView
      style={keyboardViewStyle}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        {...scrollViewProps}
      >
        {children}
      </ScrollView>
    </KeyboardSafeView>
  );
}
