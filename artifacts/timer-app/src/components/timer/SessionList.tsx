import { useListSessions, useDeleteSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatTime, cn } from "@/lib/utils";
import { Trash2, BrainCircuit, Timer, Coffee, History } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function SessionList() {
  const { data: sessions, isLoading } = useListSessions();
  const deleteSession = useDeleteSession();
  const queryClient = useQueryClient();

  const handleDelete = (id: number) => {
    deleteSession.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        },
      }
    );
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "pomodoro_focus": return <BrainCircuit className="w-4 h-4 text-focus" />;
      case "pomodoro_break": return <Coffee className="w-4 h-4 text-break" />;
      default: return <Timer className="w-4 h-4 text-primary" />;
    }
  };

  const getLabel = (type: string) => {
    switch (type) {
      case "pomodoro_focus": return "Focus";
      case "pomodoro_break": return "Break";
      default: return "Stopwatch";
    }
  };

  if (isLoading) {
    return (
      <div className="w-full py-12 flex flex-col items-center justify-center text-muted-foreground">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p>Loading history...</p>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="w-full py-16 flex flex-col items-center justify-center text-muted-foreground bg-card/30 rounded-3xl border border-dashed border-border/50">
        <History className="w-12 h-12 mb-4 opacity-20" />
        <p className="text-lg font-medium text-foreground/70">No sessions yet</p>
        <p className="text-sm mt-1">Start a timer to log your first session.</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <h3 className="text-xl font-bold flex items-center gap-2 mb-6">
        <History className="w-5 h-5 text-muted-foreground" />
        Recent History
      </h3>
      
      <div className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {sessions.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              className="group glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 transition-all hover:shadow-lg"
            >
              <div className="flex items-center gap-4 min-w-[140px]">
                <div className={cn(
                  "p-3 rounded-full shadow-inner border border-white/50",
                  session.type === "pomodoro_focus" ? "bg-focus/10" :
                  session.type === "pomodoro_break" ? "bg-break/10" : "bg-primary/5"
                )}>
                  {getIcon(session.type)}
                </div>
                <div>
                  <div className="font-bold text-lg font-mono">
                    {formatTime(session.durationSeconds)}
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {getLabel(session.type)}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 bg-secondary/30 rounded-xl p-3 border border-border/30">
                <p className="text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                  {session.notes || <span className="italic text-muted-foreground/60">No notes recorded</span>}
                </p>
              </div>

              <div className="flex items-center justify-between sm:flex-col sm:items-end sm:justify-center gap-2 min-w-[100px]">
                <div className="text-xs text-muted-foreground font-medium">
                  {format(new Date(session.createdAt), "MMM d, h:mm a")}
                </div>
                <button
                  onClick={() => handleDelete(session.id)}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label="Delete session"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
