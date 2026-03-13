import { useState, useMemo, useRef, useEffect } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { format, isSameDay, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Tag, FileText, X } from "lucide-react";
import { formatShortDuration, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type SessionItem = {
  id: number;
  type: string;
  durationSeconds: number;
  notes: string;
  taskId: number | null;
  taskName: string | null;
  projectId: number | null;
  projectName: string | null;
  createdAt: string;
};

type TimeBlock = {
  session: SessionItem;
  startMinute: number;
  endMinute: number;
};

const HOUR_HEIGHT = 60;
const MIN_BLOCK_HEIGHT = 32;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 23;

const TASK_COLORS = [
  "bg-primary/15 border-primary/40 text-primary",
  "bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-400",
  "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400",
  "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-400",
  "bg-violet-500/15 border-violet-500/40 text-violet-700 dark:text-violet-400",
  "bg-teal-500/15 border-teal-500/40 text-teal-700 dark:text-teal-400",
  "bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-400",
  "bg-green-500/15 border-green-500/40 text-green-700 dark:text-green-400",
];

const NO_TASK_COLOR = "bg-muted/30 border-border/50 text-muted-foreground";

function getTaskColor(taskId: number | null): string {
  if (taskId == null) return NO_TASK_COLOR;
  return TASK_COLORS[taskId % TASK_COLORS.length];
}

function formatTimeRange(startMinute: number, endMinute: number): string {
  const sh = Math.floor(startMinute / 60);
  const sm = startMinute % 60;
  const eh = Math.floor(endMinute / 60);
  const em = endMinute % 60;
  return `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")} – ${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

export function CalendarView() {
  const { data: sessions, isLoading } = useListSessions();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [detailSession, setDetailSession] = useState<SessionItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const daySessions = useMemo(() => {
    if (!sessions) return [];
    return (sessions as SessionItem[]).filter((s) => {
      const sessionDate = new Date(s.createdAt);
      return isSameDay(sessionDate, selectedDate);
    });
  }, [sessions, selectedDate]);

  const { blocks, startHour, endHour } = useMemo(() => {
    if (daySessions.length === 0) {
      return { blocks: [] as TimeBlock[], startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
    }

    const timeBlocks: TimeBlock[] = daySessions.map((s) => {
      const endTime = new Date(s.createdAt);
      const startTime = new Date(endTime.getTime() - s.durationSeconds * 1000);
      const startMinute = startTime.getHours() * 60 + startTime.getMinutes();
      const endMinute = endTime.getHours() * 60 + endTime.getMinutes();
      return {
        session: s,
        startMinute,
        endMinute: Math.max(endMinute, startMinute + 1),
      };
    });

    timeBlocks.sort((a, b) => a.startMinute - b.startMinute);

    const minMinute = Math.min(...timeBlocks.map((b) => b.startMinute));
    const maxMinute = Math.max(...timeBlocks.map((b) => b.endMinute));

    const sh = Math.max(0, Math.min(DEFAULT_START_HOUR, Math.floor(minMinute / 60)));
    const eh = Math.min(24, Math.max(DEFAULT_END_HOUR, Math.ceil(maxMinute / 60)));

    return { blocks: timeBlocks, startHour: sh, endHour: eh };
  }, [daySessions]);

  const totalHours = endHour - startHour;
  const timelineHeight = totalHours * HOUR_HEIGHT;
  const baseMinute = startHour * 60;

  useEffect(() => {
    if (!scrollRef.current) return;
    if (isToday(selectedDate) && daySessions.length === 0) {
      const now = new Date();
      const currentMinute = now.getHours() * 60 + now.getMinutes();
      const offset = ((currentMinute - baseMinute) / 60) * HOUR_HEIGHT - 100;
      scrollRef.current.scrollTop = Math.max(0, offset);
    } else if (blocks.length > 0) {
      const firstBlock = blocks[0];
      const offset = ((firstBlock.startMinute - baseMinute) / 60) * HOUR_HEIGHT - 40;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  }, [selectedDate, blocks, baseMinute, daySessions.length]);

  const totalDaySeconds = daySessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  const hours = Array.from({ length: totalHours + 1 }, (_, i) => startHour + i);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={() => setSelectedDate((d) => subDays(d, 1))}
            className="p-2.5 rounded-xl hover:bg-secondary/60 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="text-center">
            <button
              onClick={() => setSelectedDate(new Date())}
              className="flex flex-col items-center gap-0.5 hover:opacity-80 transition-opacity touch-manipulation"
            >
              <span className="text-sm font-bold text-foreground">
                {format(selectedDate, "EEEE, MMM d")}
              </span>
              {isToday(selectedDate) ? (
                <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                  Today
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                  Tap for today
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => setSelectedDate((d) => addDays(d, 1))}
            className="p-2.5 rounded-xl hover:bg-secondary/60 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {totalDaySeconds > 0 && (
          <div className="text-center mt-1">
            <span className="text-xs text-muted-foreground/70">
              {daySessions.length} session{daySessions.length !== 1 ? "s" : ""} &middot; {formatShortDuration(totalDaySeconds)}
            </span>
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading sessions...</p>
          </div>
        ) : daySessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-6">
            <CalendarDays className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium text-foreground/70">No sessions</p>
            <p className="text-sm mt-1 text-center">
              {isToday(selectedDate)
                ? "Start the timer to log your first session today."
                : `No sessions were recorded on ${format(selectedDate, "MMM d")}.`}
            </p>
          </div>
        ) : (
          <div className="relative px-2" style={{ height: timelineHeight }}>
            {hours.map((hour) => {
              const yPos = (hour - startHour) * HOUR_HEIGHT;
              return (
                <div key={hour} className="absolute left-0 right-0" style={{ top: yPos }}>
                  <div className="flex items-start">
                    <span className="text-[10px] text-muted-foreground/40 tabular-nums w-12 text-right pr-2 -mt-[5px] shrink-0">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                    <div className="flex-1 border-t border-border/20" />
                  </div>
                </div>
              );
            })}

            <div className="absolute left-14 right-2 top-0 bottom-0">
              {blocks.map((block) => {
                const topPx = ((block.startMinute - baseMinute) / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(
                  ((block.endMinute - block.startMinute) / 60) * HOUR_HEIGHT,
                  MIN_BLOCK_HEIGHT
                );
                const colorClass = getTaskColor(block.session.taskId);

                return (
                  <button
                    key={block.session.id}
                    onClick={() => setDetailSession(block.session)}
                    className={cn(
                      "absolute left-0 right-0 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] touch-manipulation overflow-hidden",
                      colorClass
                    )}
                    style={{ top: topPx, height: heightPx }}
                  >
                    <div className="flex items-start justify-between gap-1 h-full">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate leading-tight">
                          {block.session.taskName ?? "No task"}
                        </p>
                        {heightPx >= 44 && (
                          <p className="text-[10px] opacity-70 mt-0.5 tabular-nums">
                            {formatTimeRange(block.startMinute, block.endMinute)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-medium opacity-60 shrink-0 tabular-nums">
                        {formatShortDuration(block.session.durationSeconds)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {isToday(selectedDate) && (() => {
              const now = new Date();
              const nowMinute = now.getHours() * 60 + now.getMinutes();
              if (nowMinute < baseMinute || nowMinute > endHour * 60) return null;
              const topPx = ((nowMinute - baseMinute) / 60) * HOUR_HEIGHT;
              return (
                <div className="absolute left-12 right-2 pointer-events-none" style={{ top: topPx }}>
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                    <div className="flex-1 h-px bg-destructive/50" />
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <AnimatePresence>
        {detailSession && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-0 left-0 right-0 z-50 bg-background border-t border-border/50 rounded-t-2xl shadow-2xl max-h-[60vh] overflow-y-auto"
          >
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-foreground truncate">
                    {detailSession.taskName ?? "No task"}
                  </h3>
                  {detailSession.projectName && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      {detailSession.projectName}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDetailSession(null)}
                  className="p-2 rounded-xl hover:bg-secondary/60 transition-colors touch-manipulation -mt-1 -mr-1"
                  aria-label="Close"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              <div className="flex flex-wrap gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="tabular-nums">
                    {(() => {
                      const endTime = new Date(detailSession.createdAt);
                      const startTime = new Date(endTime.getTime() - detailSession.durationSeconds * 1000);
                      return `${format(startTime, "h:mm a")} – ${format(endTime, "h:mm a")}`;
                    })()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Tag className="w-3.5 h-3.5" />
                  <span>{formatShortDuration(detailSession.durationSeconds)}</span>
                </div>
              </div>

              {detailSession.notes && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-card/50 border border-border/30">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
                    {detailSession.notes}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                <span className="capitalize">{detailSession.type === "simple" ? "Stopwatch" : "Pomodoro"}</span>
                <span>&middot;</span>
                <span>{format(new Date(detailSession.createdAt), "MMM d, yyyy")}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {detailSession && (
        <div
          className="absolute inset-0 bg-black/20 z-40"
          onClick={() => setDetailSession(null)}
        />
      )}
    </div>
  );
}
