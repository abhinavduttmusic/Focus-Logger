import { motion, LayoutGroup } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TimerMode } from "@/hooks/use-timer";
import { Timer, BrainCircuit } from "lucide-react";

interface TimerToggleProps {
  mode: TimerMode;
  onChange: (mode: TimerMode) => void;
  /**
   * When true, taps are intercepted and onLockedTap is called instead.
   * The toggle stays fully opaque so the active pill never looks grey.
   */
  locked?: boolean;
  onLockedTap?: () => void;
}

const pillTransition = {
  type: "spring" as const,
  stiffness: 700,
  damping: 38,
  mass: 0.5,
};

const tapTransition = { duration: 0.09, ease: "easeOut" as const };

export function TimerToggle({ mode, onChange, locked, onLockedTap }: TimerToggleProps) {
  const handleClick = (target: TimerMode) => {
    if (locked) {
      onLockedTap?.();
      return;
    }
    onChange(target);
  };

  return (
    <LayoutGroup>
      {/*
        Never apply opacity to the whole container — it would make the active
        pill look grey. Lock state is communicated via the floating overlay
        message, not visual dimming.
      */}
      <div className="flex items-center p-1.5 bg-secondary/50 backdrop-blur-sm rounded-full w-fit mx-auto border border-border/40 shadow-inner">
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={tapTransition}
          onClick={() => handleClick("pomodoro")}
          className={cn(
            "relative flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors z-10",
            mode === "pomodoro"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BrainCircuit className="w-4 h-4" />
          Pomodoro
          {mode === "pomodoro" && (
            <motion.div
              layoutId="active-mode"
              className="absolute inset-0 bg-primary rounded-full -z-10 shadow-md"
              transition={pillTransition}
            />
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={tapTransition}
          onClick={() => handleClick("simple")}
          className={cn(
            "relative flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors z-10",
            mode === "simple"
              ? "text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Timer className="w-4 h-4" />
          Stopwatch
          {mode === "simple" && (
            <motion.div
              layoutId="active-mode"
              className="absolute inset-0 bg-primary rounded-full -z-10 shadow-md"
              transition={pillTransition}
            />
          )}
        </motion.button>
      </div>
    </LayoutGroup>
  );
}
