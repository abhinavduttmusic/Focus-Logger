import { Timer, History, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tab = "timer" | "logs" | "calendar";

interface BottomNavProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
  sessionIsInProgress: boolean;
}

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
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors touch-manipulation relative",
                isActive ? "text-primary" : "text-muted-foreground/60 hover:text-muted-foreground"
              )}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon className={cn("w-5 h-5", isActive && "stroke-[2.5]")} />
                {id === "timer" && sessionIsInProgress && !isActive && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </div>
              <span className={cn("text-[10px] font-medium", isActive && "font-semibold")}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
