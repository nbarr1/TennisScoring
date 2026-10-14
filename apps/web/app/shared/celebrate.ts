/** League green and gold, from the variables in globals.css. */
const COLORS = ["#1a472a", "#2d6a4f", "#a8d5a2", "#ffdc60"];

/**
 * A one-second burst of confetti from both lower corners. canvas-confetti is
 * loaded only when this runs, so it stays out of every page's bundle, and
 * `disableForReducedMotion` skips the burst when the visitor's system asks
 * for reduced motion.
 */
export async function celebrateConfirmedScore(): Promise<void> {
  try {
    const { default: confetti } = await import("canvas-confetti");
    const shared = {
      particleCount: 70,
      spread: 65,
      startVelocity: 45,
      ticks: 180,
      colors: COLORS,
      disableForReducedMotion: true,
    };
    void confetti({ ...shared, angle: 60, origin: { x: 0, y: 0.9 } });
    void confetti({ ...shared, angle: 120, origin: { x: 1, y: 0.9 } });
  } catch (error) {
    // Decoration only: a failed chunk load must not surface as an error.
    console.warn("Confetti could not load:", error);
  }
}
