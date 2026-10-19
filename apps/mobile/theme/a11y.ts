import { useEffect, useState } from "react";
import { AccessibilityInfo, Platform, type Insets } from "react-native";
import { MIN_TOUCH_TARGET } from "./tokens";

/**
 * Speak a short message through VoiceOver / TalkBack without moving focus.
 * Use it for the result of an action ("Match proposed", "Couldn't save") and
 * for content that appears away from where the user is (search results).
 * A no-op when the message is empty or no screen reader is running.
 */
export function announce(message: string | null | undefined): void {
  const text = message?.trim();
  if (!text) return;
  try {
    if (
      Platform.OS === "ios" &&
      typeof AccessibilityInfo.announceForAccessibilityWithOptions ===
        "function"
    ) {
      // Queue behind whatever VoiceOver is already saying (for example the
      // label of the button just pressed), or iOS drops the announcement.
      AccessibilityInfo.announceForAccessibilityWithOptions(text, {
        queue: true,
      });
    } else {
      AccessibilityInfo.announceForAccessibility(text);
    }
  } catch {
    // Announcements are best-effort and must never break the action.
  }
}

/**
 * The `hitSlop` that grows a visually small control to the platform minimum
 * touch target (48dp Android, 44pt iOS) without changing its layout.
 */
export function hitSlopFor(
  width: number,
  height: number = width,
  target: number = MIN_TOUCH_TARGET,
): Insets {
  const x = Math.max(0, Math.ceil((target - width) / 2));
  const y = Math.max(0, Math.ceil((target - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

/** True while the OS "Reduce Motion" / "Remove animations" setting is on. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduce(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
