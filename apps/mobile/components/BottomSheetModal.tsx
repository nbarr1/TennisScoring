import React, { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { KeyboardAwareBottomSheet } from "./KeyboardSafeView";
import {
  spacing,
  useReduceMotion,
  useColors,
  makeStyles,
  useContentWidth,
} from "../theme";

/** How far (pt) or how fast (pt/ms) a downward drag must go to dismiss. */
const DISMISS_DISTANCE = 96;
const DISMISS_VELOCITY = 1;

type BottomSheetModalProps = {
  visible: boolean;
  /**
   * Called for the backdrop, Android Back, and a downward drag on the handle.
   * It may decline to close (to confirm discarding a form, or while saving):
   * the sheet springs back if `visible` stays true.
   */
  onRequestClose: () => void;
  children: React.ReactNode;
  /** The card's own style: background, radii, padding. */
  cardStyle?: StyleProp<ViewStyle>;
  /** The card's background, painted into the home-indicator inset too. */
  fillColor?: string;
  /** The drag handle's color. Use a light gray on dark sheets. */
  handleColor?: string;
  /**
   * When set, tapping the backdrop closes the sheet and screen readers hear
   * this label for it. Form sheets leave it unset, so a stray tap never
   * throws away what was typed.
   */
  backdropLabel?: string;
  /**
   * Sheets with text fields keep the keyboard-aware wrapper (default). Short
   * action sheets turn it off and pad the card for the inset themselves.
   */
  keyboardAware?: boolean;
  overlayStyle?: StyleProp<ViewStyle>;
};

/**
 * A bottom sheet on a transparent Modal: a drag handle that dismisses with a
 * downward swipe, a fade instead of the slide when Reduce Motion / Remove
 * animations is on, and an inset filler that matches the card. Every sheet
 * still needs a visible Close or Cancel button; the handle is hidden from
 * screen readers.
 */
export function BottomSheetModal({
  visible,
  onRequestClose,
  children,
  cardStyle,
  fillColor: fillColorProp,
  handleColor: handleColorProp,
  backdropLabel,
  keyboardAware = true,
  overlayStyle,
}: BottomSheetModalProps) {
  const colors = useColors();
  const styles = useStyles();
  const fillColor = fillColorProp ?? colors.surface;
  const handleColor = handleColorProp ?? colors.borderStrong;
  // On a tablet the sheet (and its inset filler) centers at the sheet width
  // instead of spanning the screen. Undefined on phones.
  const sheetWidth = useContentWidth("sheet");
  const reduceMotion = useReduceMotion();
  const translateY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  useEffect(() => {
    if (visible) translateY.setValue(0);
  }, [visible, translateY]);

  const panResponder = useMemo(() => {
    const settle = () => {
      if (reduceMotionRef.current) {
        translateY.setValue(0);
        return;
      }
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 20,
      }).start();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          closeRef.current();
        }
        // Back to rest either way: a closing Modal animates out from there,
        // and a sheet that declined to close (a discard prompt) stays put.
        settle();
      },
      onPanResponderTerminate: settle,
    });
  }, [translateY]);

  const handle = (
    <View
      style={styles.handleZone}
      {...panResponder.panHandlers}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.handleBar, { backgroundColor: handleColor }]} />
    </View>
  );

  const backdrop = backdropLabel ? (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={onRequestClose}
      accessibilityRole="button"
      accessibilityLabel={backdropLabel}
    />
  ) : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={onRequestClose}
    >
      {keyboardAware ? (
        <KeyboardAwareBottomSheet
          style={[styles.overlay, overlayStyle]}
          fillColor={fillColor}
          sheetTranslateY={translateY}
          backdrop={backdrop}
          sheetStyle={sheetWidth}
        >
          <View
            style={[styles.card, { backgroundColor: fillColor }, cardStyle]}
            onStartShouldSetResponder={backdrop ? () => true : undefined}
            accessibilityViewIsModal
          >
            {handle}
            {children}
          </View>
        </KeyboardAwareBottomSheet>
      ) : (
        <View style={[styles.overlay, styles.overlayPlain, overlayStyle]}>
          {backdrop}
          <Animated.View
            style={[
              styles.card,
              { backgroundColor: fillColor },
              cardStyle,
              sheetWidth,
              { transform: [{ translateY }] },
            ]}
            accessibilityViewIsModal
          >
            {handle}
            {children}
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

/** Space the handle needs at the top of a card; cards pad at least this. */
export const SHEET_HANDLE_SPACE = spacing.xl;

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.overlay },
    overlayPlain: { justifyContent: "flex-end" },
    card: { paddingTop: SHEET_HANDLE_SPACE },
    // Drawn first, so the card's own controls (a Close button in the header)
    // sit above it and keep their taps.
    handleZone: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: SHEET_HANDLE_SPACE,
      alignItems: "center",
      justifyContent: "center",
    },
    handleBar: { width: 36, height: 4, borderRadius: 2 },
  }),
);
