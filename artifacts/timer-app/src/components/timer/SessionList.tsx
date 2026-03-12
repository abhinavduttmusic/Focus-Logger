import { useState, useMemo } from "react";
import { useListSessions, useDeleteSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatShortDuration, cn } from "@/lib/utils";
import { Trash2, History, Tag, Play, ChevronDown, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const BASE = import.meta.env.BASE_URL;

type RecordingItem = {
  id: number;
  sessionId: number;
  objectPath: string;
  durationSeconds: number;
  offsetSeconds: number;
  createdAt: string;
};

type TaskInfo = {
  id: number;
  name: string;
  projectId: number | null;
  projectName: string | null;
};

interface SessionListProps {
  onRestart: (task: TaskInfo | null, notes: string) => void;
}

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
  recordings: RecordingItem[];
};

type TaskGroup = {
  key: string;
  taskId: number | null;
  taskName: string | null;
  projectId: number | null;
  projectName: string | null;
  totalSeconds: number;
  sessions: SessionItem[];
};

type DayGroup = {
  dateKey: string;
  dateLabel: string;
  totalSeconds: number;
  taskGroups: TaskGroup[];
};

function buildDayGroups(sessions: SessionItem[]): DayGroup[] {
  const dayMap = new Map<string, { dateLabel: string; sessionsMap: Map<string, TaskGroup> }>();

  for (const s of sessions) {
    const date = new Date(s.createdAt);
    const dateKey = format(date, "yyyy-MM-dd");
    const dateLabel = format(date, "MMM d").toUpperCase();

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, { dateLabel, sessionsMap: new Map() });
    }

    const day = dayMap.get(dateKey)!;
    const taskKey = `${dateKey}-${s.taskId ?? "none"}`;

    if (!day.sessionsMap.has(taskKey)) {
      day.sessionsMap.set(taskKey, {
        key: taskKey,
        taskId: s.taskId,
        taskName: s.taskName,
        projectId: s.projectId,
        projectName: s.projectName,
        totalSeconds: 0,
        sessions: [],
      });
    }

    const group = day.sessionsMap.get(taskKey)!;
    group.totalSeconds += s.durationSeconds;
    group.sessions.push(s);
  }

  const dayGroups: DayGroup[] = [];
  for (const [dateKey, { dateLabel, sessionsMap }] of dayMap) {
    const taskGroups = Array.from(sessionsMap.values());
    taskGroups.sort((a, b) => b.totalSeconds - a.totalSeconds);

    for (const tg of taskGroups) {
      tg.sessions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }

    const totalSeconds = taskGroups.reduce((sum, g) => sum + g.totalSeconds, 0);
    dayGroups.push({ dateKey, dateLabel, totalSeconds, taskGroups });
  }

  dayGroups.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  return dayGroups;
}

export function SessionList({ onRestart }: SessionListProps) {
  const { data: sessions, isLoading } = useListSessions();
  const deleteSession = useDeleteSession();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const dayGroups = useMemo(() => {
    if (!sessions || sessions.length === 0) return [];
    return buildDayGroups(sessions as SessionItem[]);
  }, [sessions]);

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

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

  const handleRestart = (group: TaskGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    const task: TaskInfo | null = group.taskId != null && group.taskName != null
      ? { id: group.taskId, name: group.taskName, projectId: group.projectId, projectName: group.projectName }
      : null;
    const latestSession = group.sessions[group.sessions.length - 1];
    onRestart(task, latestSession?.notes ?? "");
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
    <div className="w-full space-y-6">
      <h3 className="text-xl font-bold flex items-center gap-2">
        <History className="w-5 h-5 text-muted-foreground" />
        Recent History
      </h3>

      <div className="space-y-8">
        {dayGroups.map(day => (
          <div key={day.dateKey} className="space-y-2">
            <div className="flex items-center justify-between px-1 pb-2 border-b border-border/40">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {day.dateLabel}
              </span>
              <span className="text-xs font-semibold text-muted-foreground/70">
                {formatShortDuration(day.totalSeconds)}
              </span>
            </div>

            <div className="space-y-1.5">
              {day.taskGroups.map(group => {
                const isExpanded = expanded.has(group.key);
                return (
                  <div key={group.key}>
                    <div
                      onClick={() => toggleExpand(group.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(group.key); } }}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-card/60 border border-border/30 hover:bg-card/90 hover:shadow-sm transition-all group touch-manipulation cursor-pointer"
                    >
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                          <span className="font-medium text-sm text-foreground/90 truncate">
                            {group.taskName ?? "No task"}
                          </span>
                          {group.projectName && (
                            <>
                              <span className="text-muted-foreground/30 text-xs">·</span>
                              <span className="text-xs text-muted-foreground/60 truncate shrink-0">
                                {group.projectName}
                              </span>
                            </>
                          )}
                        </div>
                        {group.sessions.length > 1 && (
                          <span className="text-[11px] text-muted-foreground/50 ml-5.5 pl-[22px]">
                            {group.sessions.length} sessions
                          </span>
                        )}
                      </div>

                      <span className="text-sm font-semibold text-foreground/70 tabular-nums shrink-0">
                        {formatShortDuration(group.totalSeconds)}
                      </span>

                      <ChevronDown className={cn(
                        "w-3.5 h-3.5 text-muted-foreground/40 transition-transform duration-200 shrink-0",
                        isExpanded && "rotate-180"
                      )} />

                      <button
                        onClick={(e) => handleRestart(group, e)}
                        className="p-2 rounded-xl hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                        aria-label="Restart this task"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="overflow-hidden"
                        >
                          <div className="ml-4 mr-2 mt-1 mb-2 border-l-2 border-border/30 pl-4 space-y-1">
                            {group.sessions.map(s => (
                              <div key={s.id} className="space-y-1">
                                <div
                                  className="group/session flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-secondary/30 transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-foreground/70 truncate">
                                      {s.notes || <span className="italic text-muted-foreground/40">No notes</span>}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground/50">
                                      {format(new Date(s.createdAt), "h:mm a")}
                                    </p>
                                  </div>
                                  <span className="text-xs font-medium text-muted-foreground/60 tabular-nums shrink-0">
                                    {formatShortDuration(s.durationSeconds)}
                                  </span>
                                  <button
                                    onClick={() => handleDelete(s.id)}
                                    className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/session:opacity-100 focus:opacity-100 shrink-0"
                                    aria-label="Delete session"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {s.recordings && s.recordings.length > 0 && (
                                  <div className="ml-3 space-y-1">
                                    <div className="flex items-center gap-1.5 px-3 pt-1">
                                      <Mic className="w-3 h-3 text-muted-foreground/40" />
                                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                                        Recordings
                                      </span>
                                    </div>
                                    {s.recordings.map(rec => (
                                      <div
                                        key={rec.id}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/30 border border-border/15"
                                      >
                                        <Mic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
                                          @{Math.floor(rec.offsetSeconds / 60)}:{String(rec.offsetSeconds % 60).padStart(2, "0")}
                                        </span>
                                        <audio
                                          src={`${BASE}api/storage${rec.objectPath}`}
                                          controls
                                          className="h-7 flex-1 min-w-0"
                                        />
                                        <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
                                          {rec.durationSeconds}s
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
