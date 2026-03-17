import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useListSessions } from "@workspace/api-client-react";
import { format, isSameDay, addDays, subDays, isToday } from "date-fns";
import { ChevronLeft, ChevronRight, Clock, Tag, FileText, X } from "lucide-react";
import { formatShortDuration, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { hapticLight } from "@/hooks/use-haptics";

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

const HOUR_HEIGHT = 70;
const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;
const MIN_BAR_HEIGHT = 3;
const LABEL_THRESHOLD = 18;
const TIME_THRESHOLD = 36;
const START_HOUR = 0;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const TIMELINE_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

const AXIS_LOCK_PX = 8;
const SWIPE_COMMIT_PX = 50;

const TASK_COLORS = [
  "bg-primary/25 text-primary",
  "bg-blue-500/25 text-blue-700 dark:text-blue-400",
  "bg-amber-500/25 text-amber-700 dark:text-amber-400",
  "bg-rose-500/25 text-rose-700 dark:text-rose-400",
  "bg-violet-500/25 text-violet-700 dark:text-violet-400",
  "bg-teal-500/25 text-teal-700 dark:text-teal-400",
  "bg-orange-500/25 text-orange-700 dark:text-orange-400",
  "bg-green-500/25 text-green-700 dark:text-green-400",
];

const NO_TASK_COLOR     = "bg-muted/40 text-muted-foreground";
/** Muted, low-emphasis colour for break blocks in the timeline */
const BREAK_BLOCK_COLOR = "bg-slate-300/40 text-slate-500/70 dark:bg-slate-600/20 dark:text-slate-400/60";

function isBreakSession(type: string): boolean {
  return type === "pomodoro_break";
}

function getBlockColor(session: SessionItem): string {
  if (isBreakSession(session.type)) return BREAK_BLOCK_COLOR;
  if (session.taskId == null) return NO_TASK_COLOR;
  return TASK_COLORS[session.taskId % TASK_COLORS.length];
}

function formatTimeRange(startMinute: number, endMinute: number): string {
  const sh = Math.floor(startMinute / 60);
  const sm = startMinute % 60;
  const eh = Math.floor(endMinute / 60);
  const em = endMinute % 60;
  return `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")} – ${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

function getNowMinute(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function formatMinuteLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? "100%" : "-100%" }),
  center: { x: 0 },
  exit: (dir: number) => ({ x: dir > 0 ? "-100%" : "100%" }),
};
const slideTransition = { duration: 0.22, ease: [0.25, 0, 0, 1] as const };

interface CalendarViewProps {
  isActive: boolean;
}

export function CalendarView({ isActive }: CalendarViewProps) {
  const { data: sessions, isLoading } = useListSessions();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [detailSession, setDetailSession] = useState<SessionItem | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [nowMinute, setNowMinute] = useState(getNowMinute);
  const [direction, setDirection] = useState(1);

  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const swipeAxis = useRef<"h" | "v" | null>(null);

  useEffect(() => {
    const id = setInterval(() => setNowMinute(getNowMinute()), 60_000);
    return () => clearInterval(id);
  }, []);

  const navigate = useCallback((delta: number, targetDate?: Date) => {
    setDirection(delta);
    hapticLight();
    if (targetDate) {
      setSelectedDate(targetDate);
    } else {
      setSelectedDate((d) => delta > 0 ? addDays(d, 1) : subDays(d, 1));
    }
  }, []);

  const daySessions = useMemo(() => {
    if (!sessions) return [];
    return (sessions as SessionItem[]).filter((s) => {
      const sessionDate = new Date(s.createdAt);
      return isSameDay(sessionDate, selectedDate);
    });
  }, [sessions, selectedDate]);

  const isTodayView = isToday(selectedDate);

  const blocks = useMemo(() => {
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
    return timeBlocks;
  }, [daySessions]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const tid = setTimeout(() => {
      if (isTodayView) {
        el.scrollTop = Math.max(0, nowMinute * PIXELS_PER_MINUTE - 30);
      } else if (blocks.length > 0) {
        el.scrollTop = Math.max(0, (blocks[0].startMinute / 60) * HOUR_HEIGHT - 40);
      } else {
        el.scrollTop = 9 * HOUR_HEIGHT;
      }
    }, 60);
    return () => clearTimeout(tid);
  }, [selectedDate, blocks, daySessions.length, isTodayView, nowMinute]);

  useEffect(() => {
    if (!isActive) return;
    const el = scrollRef.current;
    if (!el) return;
    const tid = setTimeout(() => {
      if (isTodayView) {
        el.scrollTop = Math.max(0, nowMinute * PIXELS_PER_MINUTE - 30);
      } else if (blocks.length > 0) {
        el.scrollTop = Math.max(0, (blocks[0].startMinute / 60) * HOUR_HEIGHT - 40);
      } else {
        el.scrollTop = 9 * HOUR_HEIGHT;
      }
    }, 60);
    return () => clearTimeout(tid);
  }, [isActive]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onStart = (e: TouchEvent) => {
      swipeStartX.current = e.touches[0].clientX;
      swipeStartY.current = e.touches[0].clientY;
      swipeAxis.current = null;
    };

    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - swipeStartX.current;
      const dy = e.touches[0].clientY - swipeStartY.current;
      if (swipeAxis.current === null) {
        if (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX) {
          swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
      }
      if (swipeAxis.current === "h") {
        e.preventDefault();
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (swipeAxis.current !== "h") return;
      const dx = e.changedTouches[0].clientX - swipeStartX.current;
      if (Math.abs(dx) >= SWIPE_COMMIT_PX) {
        navigate(dx < 0 ? 1 : -1);
      }
      swipeAxis.current = null;
    };

    const onCancel = () => {
      swipeAxis.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onCancel, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
    };
  }, [navigate]);

  const workSessions  = daySessions.filter((s) => !isBreakSession(s.type));
  const breakSessions = daySessions.filter((s) =>  isBreakSession(s.type));
  const totalFocusSeconds = workSessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalBreakSeconds = breakSessions.reduce((sum, s) => sum + s.durationSeconds, 0);

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-3 border-b border-border/30 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 rounded-xl hover:bg-secondary/60 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Previous day"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>

          <div className="text-center">
            <button
              onClick={() => {
                const today = new Date();
                navigate(today >= selectedDate ? 1 : -1, today);
              }}
              className="flex flex-col items-center gap-0.5 hover:opacity-80 transition-opacity touch-manipulation"
            >
              <span className="text-sm font-bold text-foreground">
                {format(selectedDate, "EEEE, MMM d")}
              </span>
              {isTodayView ? (
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
            onClick={() => navigate(1)}
            className="p-2.5 rounded-xl hover:bg-secondary/60 transition-colors touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Next day"
          >
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {daySessions.length > 0 && (
          <div className="text-center mt-1 flex items-center justify-center gap-2 flex-wrap">
            {totalFocusSeconds > 0 && (
              <span className="text-xs text-muted-foreground/70">
                {workSessions.length} focus session{workSessions.length !== 1 ? "s" : ""} &middot; {formatShortDuration(totalFocusSeconds)}
              </span>
            )}
            {totalBreakSeconds > 0 && (
              <>
                {totalFocusSeconds > 0 && (
                  <span className="text-xs text-muted-foreground/30">&middot;</span>
                )}
                <span className="text-xs text-muted-foreground/40">
                  {breakSessions.length} break{breakSessions.length !== 1 ? "s" : ""} &middot; {formatShortDuration(totalBreakSeconds)}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
            <p className="text-sm">Loading sessions...</p>
          </div>
        ) : (
          <div style={{ position: "relative", height: TIMELINE_HEIGHT, overflow: "hidden" }}>
            <AnimatePresence initial={false} custom={direction}>
              <motion.div
                key={format(selectedDate, "yyyy-MM-dd")}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                style={{ position: "absolute", inset: 0 }}
                className="px-2"
              >
                {hours.map((hour) => {
                  const yPos = hour * HOUR_HEIGHT;
                  return (
                    <div key={hour} className="absolute left-0 right-0" style={{ top: yPos }}>
                      <div className="flex items-start">
                        <span className="text-[10px] font-medium text-slate-400 tabular-nums w-12 text-right pr-2 -mt-[5px] shrink-0">
                          {String(hour).padStart(2, "0")}:00
                        </span>
                        <div className="flex-1 border-t border-border/50" />
                      </div>
                    </div>
                  );
                })}

                <div className="absolute left-14 right-2 top-0 bottom-0">
                  {blocks.map((block) => {
                    const topPx = (block.startMinute / 60) * HOUR_HEIGHT;
                    const heightPx = Math.max(
                      (block.session.durationSeconds / 60) * PIXELS_PER_MINUTE,
                      MIN_BAR_HEIGHT
                    );
                    const isBreak    = isBreakSession(block.session.type);
                    const colorClass = getBlockColor(block.session);
                    const showLabel     = heightPx >= LABEL_THRESHOLD;
                    const showTimeRange = heightPx >= TIME_THRESHOLD;

                    return (
                      <motion.button
                        key={block.session.id}
                        onClick={() => setDetailSession(block.session)}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        className={cn(
                          "absolute left-0 right-0 rounded text-left transition-all hover:brightness-110 touch-manipulation overflow-hidden",
                          colorClass,
                          showLabel ? "px-2 py-0.5" : "",
                          isBreak ? "opacity-60" : ""
                        )}
                        style={{ top: topPx, height: heightPx, minHeight: MIN_BAR_HEIGHT }}
                      >
                        {showLabel && (
                          <div className="flex items-start justify-between gap-1 h-full">
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-[11px] truncate leading-tight",
                                isBreak ? "font-normal italic" : "font-semibold"
                              )}>
                                {isBreak ? "Break" : (block.session.taskName ?? "No task")}
                              </p>
                              {showTimeRange && (
                                <p className="text-[10px] opacity-70 mt-0.5 tabular-nums">
                                  {formatTimeRange(block.startMinute, block.endMinute)}
                                </p>
                              )}
                            </div>
                            {showTimeRange && (
                              <span className="text-[10px] font-medium opacity-60 shrink-0 tabular-nums">
                                {formatShortDuration(block.session.durationSeconds)}
                              </span>
                            )}
                          </div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>

                {isTodayView && (() => {
                  const topPx = (nowMinute / 60) * HOUR_HEIGHT;
                  return (
                    <div className="absolute left-12 right-2 pointer-events-none z-10" style={{ top: topPx }}>
                      <div className="flex items-center">
                        <span className="text-[9px] font-semibold text-destructive tabular-nums mr-1 -mt-px">
                          {formatMinuteLabel(nowMinute)}
                        </span>
                        <div className="w-2 h-2 rounded-full bg-destructive shrink-0" />
                        <div className="flex-1 h-px bg-destructive/50" />
                      </div>
                    </div>
                  );
                })()}
              </motion.div>
            </AnimatePresence>
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
                  {isBreakSession(detailSession.type) ? (
                    <h3 className="text-base font-semibold text-muted-foreground/80 italic">
                      Break &mdash; {formatShortDuration(detailSession.durationSeconds)}
                    </h3>
                  ) : (
                    <>
                      <h3 className="text-base font-bold text-foreground truncate">
                        {detailSession.taskName ?? "No task"}
                      </h3>
                      {detailSession.projectName && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {detailSession.projectName}
                        </p>
                      )}
                    </>
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
                {!isBreakSession(detailSession.type) && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Tag className="w-3.5 h-3.5" />
                    <span>{formatShortDuration(detailSession.durationSeconds)}</span>
                  </div>
                )}
              </div>

              {!isBreakSession(detailSession.type) && detailSession.notes && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-card/50 border border-border/30">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap break-words leading-relaxed">
                    {detailSession.notes}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50">
                {isBreakSession(detailSession.type) ? (
                  <span>Pomodoro break</span>
                ) : (
                  <span className="capitalize">{detailSession.type === "simple" ? "Stopwatch" : "Pomodoro"}</span>
                )}
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
