const canVibrate =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function haptic(pattern: number | number[]): void {
  if (canVibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // silently ignore
    }
  }
}

export function hapticLight(): void {
  haptic(30);
}

export function hapticDouble(): void {
  haptic([40, 150, 40]);
}

export { haptic };
