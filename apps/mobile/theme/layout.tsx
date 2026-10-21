import React from "react";
import {
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

/**
 * Content widths for wide (tablet) windows. The app is portrait-only, so a
 * tablet is simply a tall window wider than a phone: content keeps a readable
 * measure and centers instead of stretching edge to edge.
 *
 * - `form`: forms, lists, cards, conversations, sheets (720).
 * - `wide`: screens that use the room, like the standings table (960).
 * - `sheet`: bottom sheets (640).
 */
export const CONTENT_MAX_WIDTH = {
  form: 720,
  wide: 960,
  sheet: 640,
} as const;

export type ContentWidth = keyof typeof CONTENT_MAX_WIDTH | number;

function resolveMaxWidth(max: ContentWidth): number {
  return typeof max === "number" ? max : CONTENT_MAX_WIDTH[max];
}

/**
 * The centered, max-width style for the current window, or `undefined` when
 * the window is no wider than `max`, which is every phone. Returning
 * `undefined` (not an equivalent style) keeps phone layouts byte-for-byte
 * what they were. Apply it to a ScrollView/FlatList `contentContainerStyle`,
 * or to a View that would otherwise stretch to the window's width.
 */
export function useContentWidth(
  max: ContentWidth = "form",
): ViewStyle | undefined {
  const { width } = useWindowDimensions();
  const maxWidth = resolveMaxWidth(max);
  if (width <= maxWidth) return undefined;
  return { width: "100%", maxWidth, alignSelf: "center" };
}

/** True when the window is wider than the `form` width (a tablet). */
export function useIsWideScreen(): boolean {
  return useWindowDimensions().width > CONTENT_MAX_WIDTH.form;
}

/**
 * A View that centers its children at a max width on tablets. On phones it
 * renders a plain View with only the given style, so nothing changes there.
 * `fill` gives it `flex: 1` for a screen body.
 */
export function ScreenContainer({
  maxWidth = "form",
  fill = false,
  style,
  ...props
}: ViewProps & { maxWidth?: ContentWidth; fill?: boolean }) {
  const constrained = useContentWidth(maxWidth);
  const base: StyleProp<ViewStyle> = fill ? { flex: 1 } : undefined;
  return <View style={[base, constrained, style]} {...props} />;
}
