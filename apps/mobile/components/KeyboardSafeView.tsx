import React, { useEffect, useState } from "react";
import {
  Animated,
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
import { useColors } from "../theme/scheme";

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
  /**
   * The color painted under the sheet in the home-indicator inset. Match the
   * sheet card's background, or a dark sheet sits on a white strip.
   */
  fillColor?: string;
  /** Moves the sheet and its inset filler together (the drag-to-dismiss offset). */
  sheetTranslateY?: Animated.Value;
  /** Drawn behind the sheet, filling the overlay (a tap-to-close backdrop). */
  backdrop?: React.ReactNode;
  /**
   * Wraps the sheet and its inset filler, so a max width (tablets) applies to
   * both. Leave it unset to render them without a wrapper.
   */
  sheetStyle?: StyleProp<ViewStyle>;
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
  fillColor: fillColorProp,
  sheetTranslateY,
  backdrop,
  sheetStyle,
}: KeyboardAwareBottomSheetProps) {
  const colors = useColors();
  const fillColor = fillColorProp ?? colors.surface;
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
  const filler =
    homeInset > 0 ? (
      <View
        style={{ height: homeInset, backgroundColor: fillColor }}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    ) : null;

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
        {backdrop}
        {sheetTranslateY ? (
          <Animated.View
            style={[sheetStyle, { transform: [{ translateY: sheetTranslateY }] }]}
          >
            {children}
            {filler}
          </Animated.View>
        ) : sheetStyle ? (
          <View style={sheetStyle}>
            {children}
            {filler}
          </View>
        ) : (
          <>
            {children}
            {filler}
          </>
        )}
      </ScrollView>
    </View>
  );
}
