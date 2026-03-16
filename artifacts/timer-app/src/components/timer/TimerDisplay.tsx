import { formatTime, cn } from "@/lib/utils";
import type { TimerMode, PomodoroPhase } from "@/hooks/use-timer";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, Pause } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ── Progress ring geometry ── */
const RING_SIZE = 336;
const STROKE = 2.5;
const RADIUS = (RING_SIZE - STROKE) / 2;           // 166.75
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;         // ≈ 1047.8

interface TimerDisplayProps {
  mode: TimerMode;
  phase: PomodoroPhase;
  seconds: number;
  isActive: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
  modeDir: React.MutableRefObject<"left" | "right">;
}

function computeProgress(mode: TimerMode, phase: PomodoroPhase, seconds: number): number {
  if (mode === "pomodoro") {
    const total = phase === "focus" ? 25 * 60 : 5 * 60;
    return total > 0 ? (total - seconds) / total : 0;
  }
  // Stopwatch — fills every hour
  return (seconds % 3600) / 3600;
}

export function TimerDisplay({
  mode,
  phase,
  seconds,
  isActive,
  onStart,
  onPause,
  onStop,
  modeDir,
}: TimerDisplayProps) {
  const isPomodoro = mode === "pomodoro";

  const colorClass = !isPomodoro
    ? "text-primary"
    : phase === "focus"
      ? "text-focus"
      : "text-break";

  const progress = computeProgress(mode, phase, seconds);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className="flex flex-col items-center justify-center py-8">

      {/* ── Digits + progress ring ── */}
      <div className="relative flex items-center justify-center">

        {/* SVG ring — positioned absolutely so it never shifts layout */}
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          aria-hidden
          className={cn("absolute pointer-events-none transition-colors duration-500", colorClass)}
          style={{
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {/* Track (background circle) */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeOpacity={0.1}
          />
          {/* Progress arc */}
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeOpacity={0.82}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.5s ease",
            }}
          />
        </svg>

        {/* Digits — overflow-hidden clips the horizontal slide exit/enter */}
        <div className="overflow-hidden relative">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: modeDir.current === "left" ? 40 : -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: modeDir.current === "left" ? -40 : 40 }}
              transition={{ duration: 0.2, ease: EASE }}
              className={cn(
                "font-mono text-[8rem] sm:text-[10rem] leading-none tracking-tighter transition-colors duration-500",
                colorClass
              )}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatTime(seconds)}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ── Controls — outside the ring/digit area, never remounts ── */}
      <div className="relative z-10 isolate flex items-center gap-6 mt-10">
        {!isActive ? (
          <button
            onClick={onStart}
            className={cn(
              "flex items-center justify-center w-20 h-20 rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 text-white",
              !isPomodoro
                ? "bg-primary hover:bg-primary/90 shadow-primary/25"
                : phase === "focus"
                  ? "bg-focus hover:bg-focus/90 shadow-focus/25"
                  : "bg-break hover:bg-break/90 shadow-break/25"
            )}
            aria-label="Start Timer"
          >
            <Play className="w-8 h-8 ml-1" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex items-center justify-center w-20 h-20 rounded-full bg-secondary text-secondary-foreground shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 border border-border"
            aria-label="Pause Timer"
          >
            <Pause className="w-8 h-8" fill="currentColor" />
          </button>
        )}

        <motion.button
          onClick={onStop}
          disabled={seconds === 0 && !isActive}
          whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.12, ease: EASE }}
          className="flex items-center justify-center w-16 h-16 rounded-full border border-destructive/30 bg-card text-destructive/50 shadow-sm hover:bg-destructive/8 hover:border-destructive/50 hover:text-destructive/80 transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Stop Timer"
        >
          <Square className="w-5 h-5" fill="currentColor" />
        </motion.button>
      </div>
    </div>
  );
}
