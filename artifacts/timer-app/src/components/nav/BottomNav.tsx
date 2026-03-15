import { Timer, History, CheckSquare, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type Tab = "timer" | "activity" | "tasks" | "stats";

interface BottomNavProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  sessionIsInProgress: boolean;
}

const LIFT_TRANSITION = { duration: 0.14, ease: [0.22, 1, 0.36, 1] as const };
const TAP_SPRING = { duration: 0.09, ease: "easeOut" as const };
const MICRO_EASE: number[] = [0.22, 1, 0.36, 1];

const ICON_ANIMATIONS: Record<Tab, { animate: Record<string, number[]>; duration: number }> = {
  timer: { animate: { rotate: [0, 6, 0] }, duration: 0.18 },
  activity: { animate: { scale: [1, 1.12, 1] }, duration: 0.18 },
  tasks: { animate: { scale: [1, 1.12, 1] }, duration: 0.18 },
  stats: { animate: { scale: [1, 1.12, 1] }, duration: 0.18 },
};

const tabs: { id: Tab; label: string; Icon: typeof Timer }[] = [
  { id: "timer", label: "Timer", Icon: Timer },
  { id: "activity", label: "Activity", Icon: History },
  { id: "tasks", label: "Tasks", Icon: CheckSquare },
  { id: "stats", label: "Stats", Icon: BarChart2 },
];

export function BottomNav({ activeTab, onChange, sessionIsInProgress }: BottomNavProps) {
  return (
    <nav className="shrink-0 bg-background/95 backdrop-blur-lg border-t border-border/40 pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          const anim = ICON_ANIMATIONS[id];
          return (
            <motion.button
              key={id}
              onClick={() => onChange(id)}
              whileTap={{ scale: 0.92 }}
              transition={TAP_SPRING}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full touch-manipulation relative",
                isActive ? "text-primary" : "text-neutral-500 hover:text-neutral-600"
              )}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <motion.div
                animate={{ y: isActive ? -2 : 0 }}
                transition={LIFT_TRANSITION}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={isActive ? `${id}-active` : id}
                    className="relative"
                    animate={isActive ? anim.animate : {}}
                    transition={{ duration: anim.duration, ease: MICRO_EASE }}
                  >
                    <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                    {id === "timer" && sessionIsInProgress && !isActive && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
              <span
                className={cn("text-[10px] transition-[font-weight] duration-150", isActive ? "font-semibold" : "font-medium")}
              >
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
