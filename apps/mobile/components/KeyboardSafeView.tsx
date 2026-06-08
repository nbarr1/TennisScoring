import React, { useEffect, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type KeyboardSafeViewProps = Omit<KeyboardAvoidingViewProps, "behavior"> & {
  behavior?: KeyboardAvoidingViewProps["behavior"];
};

type KeyboardAwareScrollViewProps = ScrollViewProps & {
  keyboardViewStyle?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
};

type KeyboardAwareBottomSheetProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
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

export function KeyboardAwareBottomSheet({
  children,
  style,
  contentContainerStyle,
}: KeyboardAwareBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates.height),
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const bottomInset =
    keyboardHeight > 0 ? keyboardHeight : Math.max(insets.bottom, 24);

  return (
    <View style={[{ flex: 1, paddingBottom: bottomInset }, style]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { flexGrow: 1, justifyContent: "flex-end", paddingTop: 24 },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        bounces={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}
