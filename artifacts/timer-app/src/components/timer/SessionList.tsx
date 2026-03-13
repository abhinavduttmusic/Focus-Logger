import { useState, useRef, useMemo } from "react";
import { useListSessions, useDeleteSession, useUpdateSession, getListSessionsQueryKey, getListTasksQueryKey } from "@workspace/api-client-react";
import type { UpdateSessionRequest } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatShortDuration, cn } from "@/lib/utils";
import { Trash2, History, Tag, Play, Pause, ChevronDown, Mic, ListOrdered, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionTaskPicker } from "./SessionTaskPicker";

const BASE = import.meta.env.BASE_URL;

type RecordingItem = {
  id: number;
  sessionId: number;
  objectPath: string;
  label: string | null;
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

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PlayableRecording({ rec, indexInSession }: { rec: RecordingItem; indexInSession: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card/30 border border-border/15">
      <audio
        ref={audioRef}
        src={`${BASE}api/storage${rec.objectPath}`}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
        {formatOffset(rec.offsetSeconds)}
      </span>
      <Mic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
      <span className="flex-1 min-w-0 text-xs text-foreground/70 truncate">
        {rec.label || `Recording ${indexInSession + 1}`}
      </span>
      <span className="text-[11px] text-muted-foreground/30 shrink-0">&mdash;</span>
      <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
        {rec.durationSeconds}s
      </span>
      <button
        onClick={toggle}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="w-3 h-3" fill="currentColor" />
        ) : (
          <Play className="w-3 h-3" fill="currentColor" />
        )}
      </button>
    </div>
  );
}

function EditSessionForm({
  session,
  onSave,
  onCancel,
  isSaving,
}: {
  session: SessionItem;
  onSave: (durationSeconds: number, createdAt: string | null, taskId: number | null | undefined) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [minutes, setMinutes] = useState(String(Math.floor(session.durationSeconds / 60)));
  const [secs, setSecs] = useState(String(session.durationSeconds % 60));
  const [startTime, setStartTime] = useState(
    format(new Date(session.createdAt), "HH:mm"),
  );
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(session.taskId);
  const [selectedTaskName, setSelectedTaskName] = useState<string | null>(session.taskName);
  const taskChanged = selectedTaskId !== session.taskId;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const totalSecs = Math.max(1, (parseInt(minutes) || 0) * 60 + (parseInt(secs) || 0));
    const originalTime = format(new Date(session.createdAt), "HH:mm");
    const timeChanged = startTime !== originalTime;
    let newCreatedAt: string | null = null;
    if (timeChanged) {
      const d = new Date(session.createdAt);
      const [h, m] = startTime.split(":").map(Number);
      d.setHours(h, m);
      newCreatedAt = d.toISOString();
    }
    onSave(totalSecs, newCreatedAt, taskChanged ? selectedTaskId : undefined);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 py-2 px-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            max="999"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-12 px-1.5 py-1 text-xs text-center rounded-md border border-border/50 bg-background/50 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label="Minutes"
          />
          <span className="text-xs text-muted-foreground">m</span>
          <input
            type="number"
            min="0"
            max="59"
            value={secs}
            onChange={(e) => setSecs(e.target.value)}
            className="w-12 px-1.5 py-1 text-xs text-center rounded-md border border-border/50 bg-background/50 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label="Seconds"
          />
          <span className="text-xs text-muted-foreground">s</span>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-1.5 py-1 text-xs rounded-md border border-border/50 bg-background/50 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary/40"
            aria-label="Start time"
          />
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="submit"
            disabled={isSaving}
            className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
            aria-label="Save changes"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/40 transition-colors disabled:opacity-50"
            aria-label="Cancel edit"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="max-w-[200px]">
        <SessionTaskPicker
          currentTaskId={selectedTaskId}
          currentTaskName={selectedTaskName}
          onSelect={(task) => {
            setSelectedTaskId(task?.id ?? null);
            setSelectedTaskName(task?.name ?? null);
          }}
        />
      </div>
    </form>
  );
}

function ConfirmBanner({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-xs">
        <span className="flex-1 text-foreground/80">{message}</span>
        <button
          onClick={onConfirm}
          className="px-2 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-[11px] font-medium hover:bg-destructive transition-colors"
        >
          Delete
        </button>
        <button
          onClick={onCancel}
          className="px-2 py-1 rounded-md bg-secondary/60 text-foreground/70 text-[11px] font-medium hover:bg-secondary transition-colors"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

export function SessionList({ onRestart }: SessionListProps) {
  const { data: sessions, isLoading } = useListSessions();
  const deleteSession = useDeleteSession();
  const updateSession = useUpdateSession();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);

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
          setConfirmDeleteId(null);
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        },
      }
    );
  };

  const handleUpdate = (id: number, durationSeconds: number, createdAt: string | null, taskId: number | null | undefined) => {
    const data: UpdateSessionRequest = { durationSeconds };
    if (createdAt) data.createdAt = createdAt;
    if (taskId !== undefined) data.taskId = taskId;

    updateSession.mutate(
      { id, data },
      {
        onSuccess: () => {
          setEditingId(null);
          queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
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
                              <span className="text-muted-foreground/30 text-xs">&middot;</span>
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
                        className="p-2 rounded-xl hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors shrink-0"
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
                            {group.sessions.map(s => {
                              const sortedRecs = s.recordings
                                ? [...s.recordings].sort((a, b) => a.offsetSeconds - b.offsetSeconds)
                                : [];
                              const isEditing = editingId === s.id;
                              const isConfirmingDelete = confirmDeleteId === s.id;

                              return (
                                <div key={s.id} className="space-y-1">
                                  {isEditing ? (
                                    <EditSessionForm
                                      session={s}
                                      onSave={(dur, createdAt, taskId) => handleUpdate(s.id, dur, createdAt, taskId)}
                                      onCancel={() => setEditingId(null)}
                                      isSaving={updateSession.isPending}
                                    />
                                  ) : (
                                    <div
                                      className="group/session flex items-start gap-3 py-2 px-3 rounded-xl hover:bg-secondary/30 transition-colors"
                                    >
                                      <div className="flex-1 min-w-0">
                                        {s.notes ? (
                                          <button
                                            type="button"
                                            onClick={() => setExpandedNoteId(expandedNoteId === s.id ? null : s.id)}
                                            aria-expanded={expandedNoteId === s.id}
                                            className="flex items-start gap-1.5 text-left w-full touch-manipulation"
                                          >
                                            <ChevronDown className={cn(
                                              "w-3 h-3 mt-0.5 shrink-0 text-muted-foreground/40 transition-transform duration-200",
                                              expandedNoteId === s.id ? "rotate-0" : "-rotate-90"
                                            )} />
                                            <span className={cn(
                                              "text-sm text-foreground/70 flex-1 min-w-0",
                                              expandedNoteId === s.id
                                                ? "whitespace-pre-wrap break-words max-h-40 overflow-y-auto"
                                                : "truncate block"
                                            )}>
                                              {s.notes}
                                            </span>
                                          </button>
                                        ) : (
                                          <p className="text-sm italic text-muted-foreground/40">No notes</p>
                                        )}
                                        <p className="text-[11px] text-muted-foreground/50 mt-0.5">
                                          {format(new Date(s.createdAt), "h:mm a")}
                                        </p>
                                      </div>
                                      <span className="text-xs font-medium text-muted-foreground/60 tabular-nums shrink-0 mt-2">
                                        {formatShortDuration(s.durationSeconds)}
                                      </span>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={() => { setExpandedNoteId(null); setEditingId(s.id); }}
                                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-secondary/40 transition-colors"
                                          aria-label="Edit session"
                                          title="Edit"
                                        >
                                          <Pencil className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setConfirmDeleteId(s.id)}
                                          className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                          aria-label="Delete session"
                                          title="Delete"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  <AnimatePresence>
                                    {isConfirmingDelete && !isEditing && (
                                      <ConfirmBanner
                                        message="Delete this session?"
                                        onConfirm={() => handleDelete(s.id)}
                                        onCancel={() => setConfirmDeleteId(null)}
                                      />
                                    )}
                                  </AnimatePresence>
                                  {sortedRecs.length > 0 && (
                                    <div className="ml-3 space-y-1">
                                      <div className="flex items-center gap-1.5 px-3 pt-1">
                                        <ListOrdered className="w-3 h-3 text-muted-foreground/40" />
                                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
                                          Session Timeline
                                        </span>
                                      </div>
                                      {sortedRecs.map((rec, idx) => (
                                        <PlayableRecording key={rec.id} rec={rec} indexInSession={idx} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
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
