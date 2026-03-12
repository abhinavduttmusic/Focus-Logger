import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TimerMode } from "@/hooks/use-timer";
import { Timer, BrainCircuit } from "lucide-react";

interface TimerToggleProps {
  mode: TimerMode;
  onChange: (mode: TimerMode) => void;
}

export function TimerToggle({ mode, onChange }: TimerToggleProps) {
  return (
    <div className="flex items-center p-1.5 bg-secondary/50 backdrop-blur-sm rounded-full w-fit mx-auto border border-border/40 shadow-inner">
      <button
        onClick={() => onChange("pomodoro")}
        className={cn(
          "relative flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors z-10",
          mode === "pomodoro" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <BrainCircuit className="w-4 h-4" />
        Pomodoro
        {mode === "pomodoro" && (
          <motion.div
            layoutId="active-mode"
            className="absolute inset-0 bg-primary rounded-full -z-10 shadow-md"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </button>

      <button
        onClick={() => onChange("simple")}
        className={cn(
          "relative flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold transition-colors z-10",
          mode === "simple" ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Timer className="w-4 h-4" />
        Stopwatch
        {mode === "simple" && (
          <motion.div
            layoutId="active-mode"
            className="absolute inset-0 bg-primary rounded-full -z-10 shadow-md"
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
        )}
      </button>
    </div>
  );
}
