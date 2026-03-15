import { formatTime, cn } from "@/lib/utils";
import type { TimerMode, PomodoroPhase } from "@/hooks/use-timer";
import { motion } from "framer-motion";
import { Play, Square, Pause } from "lucide-react";

interface TimerDisplayProps {
  mode: TimerMode;
  phase: PomodoroPhase;
  seconds: number;
  isActive: boolean;
  onStart: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function TimerDisplay({ mode, phase, seconds, isActive, onStart, onPause, onStop }: TimerDisplayProps) {
  const isPomodoro = mode === "pomodoro";

  return (
    <div className="flex flex-col items-center justify-center py-12">
      
      {/* Main Timer Display */}
      <div className="relative flex items-center justify-center group">
        <motion.div 
          className={cn(
            "font-mono text-[8rem] sm:text-[10rem] leading-none tracking-tighter transition-colors duration-500",
            !isPomodoro ? "text-primary" : phase === "focus" ? "text-focus" : "text-break"
          )}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {formatTime(seconds)}
        </motion.div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 mt-12">
        {!isActive ? (
          <button
            onClick={onStart}
            className={cn(
              "flex items-center justify-center w-20 h-20 rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 text-white",
              !isPomodoro ? "bg-primary hover:bg-primary/90 shadow-primary/25" :
              phase === "focus" ? "bg-focus hover:bg-focus/90 shadow-focus/25" : 
              "bg-break hover:bg-break/90 shadow-break/25"
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
          transition={{ duration: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center w-16 h-16 rounded-full border border-destructive/25 bg-destructive/5 text-destructive/50 shadow-sm hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive/70 transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="Stop Timer"
        >
          <Square className="w-5 h-5" fill="currentColor" />
        </motion.button>
      </div>
    </div>
  );
}
