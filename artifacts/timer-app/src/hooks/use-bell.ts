/**
 * Synthesises a soft bell tone using the Web Audio API.
 * Call any time you need an auditory phase-transition cue.
 */
export function playBell(): void {
  try {
    const ACtx =
      window.AudioContext ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    if (!ACtx) return;

    const ctx = new ACtx() as AudioContext;
    const now = ctx.currentTime;
    const duration = 1.8;

    const harmonics: { freq: number; peak: number }[] = [
      { freq: 880,  peak: 0.32 },
      { freq: 1108, peak: 0.14 },
      { freq: 1760, peak: 0.08 },
      { freq: 2637, peak: 0.04 },
    ];

    harmonics.forEach(({ freq, peak }) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });

    setTimeout(() => ctx.close().catch(() => {}), (duration + 0.6) * 1000);
  } catch {
    // silently ignore — AudioContext may be unavailable or blocked
  }
}
