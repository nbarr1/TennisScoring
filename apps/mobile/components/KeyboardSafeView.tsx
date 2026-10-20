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
import { colors } from "../theme/tokens";

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

  // The keyboard pushes the sheet up from outside. The home-indicator inset is
  // painted inside the sheet instead (the filler below), so no strip of dimmed
  // backdrop shows between the white sheet and the bottom edge.
  const homeInset = keyboardHeight > 0 ? 0 : insets.bottom;

  return (
    <View style={[{ flex: 1, paddingBottom: keyboardHeight }, style]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { flexGrow: 1, justifyContent: "flex-end", paddingTop: 24 },
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        bounces={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        {children}
        {homeInset > 0 ? (
          <View
            style={{ height: homeInset, backgroundColor: colors.surface }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
