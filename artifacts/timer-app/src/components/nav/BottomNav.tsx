import { Timer, History, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export type Tab = "timer" | "logs" | "calendar";

interface BottomNavProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  sessionIsInProgress: boolean;
}

const TAP_SPRING = { duration: 0.12, ease: "easeOut" as const };

const MICRO_EASE = [0.22, 1, 0.36, 1] as const;

const ICON_ANIMATIONS: Record<Tab, { animate: Record<string, number[]>; duration: number }> = {
  timer: { animate: { rotate: [0, 6, 0] }, duration: 0.18 },
  logs: { animate: { rotate: [0, 15, 0] }, duration: 0.16 },
  calendar: { animate: { y: [0, -2, 0], scale: [1, 1.04, 1] }, duration: 0.18 },
};

const tabs: { id: Tab; label: string; Icon: typeof Timer }[] = [
  { id: "timer", label: "Timer", Icon: Timer },
  { id: "logs", label: "Logs", Icon: History },
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
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
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors duration-200 touch-manipulation relative",
                isActive ? "text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={isActive ? `${id}-active` : id}
                  className="relative"
                  animate={isActive ? anim.animate : {}}
                  transition={{ duration: anim.duration, ease: MICRO_EASE as unknown as number[] }}
                >
                  <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                  {id === "timer" && sessionIsInProgress && !isActive && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                  )}
                </motion.div>
              </AnimatePresence>
              <span className={cn("text-[10px] font-medium transition-colors duration-200", isActive && "font-semibold")}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
