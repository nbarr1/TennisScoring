import { useFonts } from "expo-font";
import type { MatchMomentTone } from "@tennis/shared";

/**
 * Live-scoring "split scoreboard" palette. Pure black and white for glare on
 * court; every text pairing here is at least 9:1. The two player stripes are
 * blue and orange so they stay distinguishable with red-green colour
 * blindness, and they are never the only cue: each row also carries a name.
 */
export const SB = {
  bg: "#000000",
  row: "#0A0A0A",
  winnerRow: "#141208",
  panel: "#141414",
  control: "#1C1C1C",
  controlFill: "#3A3A3A",
  line: "#262626",
  text: "#FFFFFF",
  muted: "#B3B3B3",
  lost: "#A6A6A6",
  yellow: "#FFD60A",
  onYellow: "#000000",
  danger: "#FF8A80",
  stripeP1: "#3D8BFF",
  stripeP2: "#FF9F1C",
  ballOff: "#333333",
  wonSet: "#2A2A2A",
  lostSet: "#141414",
} as const;

/** Band colours per match moment; text on each is black, at least 7:1. */
export const BAND_TONES: Record<MatchMomentTone, { bg: string; fg: string }> = {
  live: { bg: "#161616", fg: SB.text },
  deuce: { bg: "#FFFFFF", fg: "#000000" },
  ad: { bg: SB.yellow, fg: "#000000" },
  sp: { bg: SB.yellow, fg: "#000000" },
  bp: { bg: "#FF9F1C", fg: "#000000" },
  mp: { bg: "#FF6B81", fg: "#000000" },
  tb: { bg: SB.yellow, fg: "#000000" },
  ok: { bg: "#3DDC84", fg: "#000000" },
};

export const FONT = {
  semibold: "BarlowCondensed_600SemiBold",
  bold: "BarlowCondensed_700Bold",
  extrabold: "BarlowCondensed_800ExtraBold",
} as const;

/**
 * Loads the three Barlow Condensed weights the scoreboard uses. Each file is
 * required on its own so the package's other fifteen weights stay out of the
 * bundle. Until they load (or if loading fails) text falls back to the system
 * font rather than blocking the screen.
 */
export function useScoreboardFonts(): boolean {
  const [loaded] = useFonts({
    [FONT.semibold]: require("@expo-google-fonts/barlow-condensed/600SemiBold/BarlowCondensed_600SemiBold.ttf"),
    [FONT.bold]: require("@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf"),
    [FONT.extrabold]: require("@expo-google-fonts/barlow-condensed/800ExtraBold/BarlowCondensed_800ExtraBold.ttf"),
  });
  return loaded;
}

/**
 * The Barlow family once loaded; before that, an equivalent system weight, so
 * the screen never renders with a font name the platform does not know.
 */
export function font(loaded: boolean, weight: keyof typeof FONT) {
  if (loaded) return { fontFamily: FONT[weight] };
  const fontWeight = { semibold: "600", bold: "700", extrabold: "800" } as const;
  return { fontWeight: fontWeight[weight] };
}

/** "Alex Rivera" → "Rivera"; a doubles team "Ann Smith / Bob Jones" → "Smith / Jones". */
export function shortName(name: string): string {
  return name
    .split(" / ")
    .map((part) => {
      const words = part.trim().split(/\s+/);
      return words[words.length - 1] ?? part;
    })
    .join(" / ");
}
