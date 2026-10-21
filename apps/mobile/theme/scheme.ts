import { useColorScheme } from "react-native";
import type { MatchStatus } from "@tennis/shared";
import {
  palettes,
  statusTextColorsByScheme,
  type ThemeColors,
  type ThemeScheme,
} from "./tokens";

/**
 * The device's color scheme, narrowed to the two palettes the app ships.
 * React Native's `useColorScheme()` re-renders when the setting changes
 * (`userInterfaceStyle: "automatic"` in app.json lets it follow the device).
 * An unknown or unspecified scheme falls back to light.
 */
export function useColorSchemeName(): ThemeScheme {
  return useColorScheme() === "dark" ? "dark" : "light";
}

export type Theme = {
  scheme: ThemeScheme;
  isDark: boolean;
  colors: ThemeColors;
  statusTextColors: Record<MatchStatus, string>;
};

const themes: Record<ThemeScheme, Theme> = {
  light: {
    scheme: "light",
    isDark: false,
    colors: palettes.light,
    statusTextColors: statusTextColorsByScheme.light,
  },
  dark: {
    scheme: "dark",
    isDark: true,
    colors: palettes.dark,
    statusTextColors: statusTextColorsByScheme.dark,
  },
};

/** The palette, status text colors, and scheme for the current device setting. */
export function useTheme(): Theme {
  return themes[useColorSchemeName()];
}

/** The palette for the current device setting. */
export function useColors(): ThemeColors {
  return palettes[useColorSchemeName()];
}

/** Contrast-safe status text colors for the current scheme (see tokens.ts). */
export function useStatusTextColors(): Record<MatchStatus, string> {
  return statusTextColorsByScheme[useColorSchemeName()];
}

/**
 * Themed styles. Define the factory at module level and call the returned
 * hook inside the component:
 *
 *   const useStyles = makeStyles((colors) => StyleSheet.create({
 *     card: { backgroundColor: colors.surface },
 *   }));
 *   function Card() { const styles = useStyles(); ... }
 *
 * The factory runs at most once per scheme; both results are cached at module
 * level, so the hook costs one `useColorScheme()` read.
 */
export function makeStyles<T>(
  factory: (colors: ThemeColors, scheme: ThemeScheme) => T,
): () => T {
  const cache: Partial<Record<ThemeScheme, T>> = {};
  return function useThemedStyles(): T {
    const scheme = useColorSchemeName();
    let styles = cache[scheme];
    if (styles === undefined) {
      styles = factory(palettes[scheme], scheme);
      cache[scheme] = styles;
    }
    return styles;
  };
}
