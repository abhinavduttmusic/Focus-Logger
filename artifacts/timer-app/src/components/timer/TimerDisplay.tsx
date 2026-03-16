import { formatTime, cn } from "@/lib/utils";
import type { TimerMode, PomodoroPhase } from "@/hooks/use-timer";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, Pause } from "lucide-react";

const EASE = [0.22, 1, 0.36, 1] as const;

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

  return (
    <div className="flex flex-col items-center justify-center pt-4 pb-6">

      {/* Digits */}
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

      {/* Controls — never remounts */}
      <div className="relative z-10 isolate flex items-center gap-6 mt-7">
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
