import { useState, useRef, useMemo, useEffect } from "react";
import { useListSessions, useDeleteSession, useUpdateSession, getListSessionsQueryKey, getListTasksQueryKey } from "@workspace/api-client-react";
import type { UpdateSessionRequest } from "@workspace/api-client-react/src/generated/api.schemas";
import { useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { formatShortDuration, cn } from "@/lib/utils";
import { Trash2, History, Play, Pause, ChevronDown, Mic, ListOrdered, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence, type Transition } from "framer-motion";

const TAP_SPRING: Transition = { duration: 0.12, ease: "easeOut" };
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
    const dateLabel = isToday(date) ? "Today" : isYesterday(date) ? "Yesterday" : format(date, "MMM d");

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

const AUDIO_PLAY_EVENT = "flowstate-audio-play";

function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function PlayableRecording({ rec, indexInSession }: { rec: RecordingItem; indexInSession: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(rec.durationSeconds);
  const idRef = useRef(crypto.randomUUID());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail !== idRef.current && audioRef.current) {
        audioRef.current.pause();
        setPlaying(false);
      }
    };
    window.addEventListener(AUDIO_PLAY_EVENT, handler);
    return () => window.removeEventListener(AUDIO_PLAY_EVENT, handler);
  }, []);

  const toggle = async () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      window.dispatchEvent(new CustomEvent(AUDIO_PLAY_EVENT, { detail: idRef.current }));
      try {
        await audioRef.current.play();
        setPlaying(true);
      } catch { /* browser blocked autoplay */ }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 rounded-lg bg-card/30 border border-border/15">
      <audio
        ref={audioRef}
        src={`${BASE}api/storage${rec.objectPath}`}
        preload="metadata"
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => {
          if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        onDurationChange={() => {
          if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
            setDuration(audioRef.current.duration);
          }
        }}
        className="hidden"
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
          {formatOffset(rec.offsetSeconds)}
        </span>
        <Mic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        <span className="flex-1 min-w-0 text-xs text-foreground/70 truncate">
          {rec.label || `Recording ${indexInSession + 1}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={toggle}
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="w-3.5 h-3.5" fill="currentColor" />
          ) : (
            <Play className="w-3.5 h-3.5" fill="currentColor" />
          )}
        </button>
        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-[34px] text-right">
          {fmtTime(currentTime)}
        </span>
        <input
          type="range"
          min={0}
          max={duration ?? 1}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-1.5 rounded-full appearance-none bg-border/30 cursor-pointer touch-manipulation [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
        />
        <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 w-[34px]">
          {fmtTime(duration)}
        </span>
      </div>
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

import { ConfirmBanner } from "@/components/ui/confirm-banner";

export function SessionList({ onRestart }: SessionListProps) {
  const { data: sessions, isLoading } = useListSessions();
  const deleteSession = useDeleteSession();
  const updateSession = useUpdateSession();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteId2, setConfirmDeleteId2] = useState<number | null>(null);
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
          setConfirmDeleteId2(null);
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
    onRestart(task, "");
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
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 -mt-4 pt-6 pb-8 min-h-full bg-[#F7F7F8] space-y-6">
      <h3 className="text-xl font-semibold flex items-center gap-2">
        <History className="w-5 h-5 text-muted-foreground" />
        Logs
      </h3>

      <div className="space-y-8">
        {dayGroups.map(day => (
          <div key={day.dateKey} className="space-y-2">
            <div className="flex items-center justify-between px-1 pb-3">
              <span className="text-[13px] font-semibold text-muted-foreground/70 uppercase" style={{ letterSpacing: "0.05em" }}>
                {day.dateLabel}
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground/50 tabular-nums">
                {formatShortDuration(day.totalSeconds)}
              </span>
            </div>

            <div className="space-y-2">
              {day.taskGroups.map(group => {
                const isExpanded = expanded.has(group.key);
                return (
                  <div key={group.key}>
                    <motion.div
                      onClick={() => toggleExpand(group.key)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(group.key); } }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.12 }}
                      className="w-full bg-white touch-manipulation cursor-pointer"
                      style={{ borderRadius: "14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)", padding: "14px 16px" }}
                    >
                      <div className="flex items-center gap-3">

                        {/* Left: badge + task name / project name */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 min-w-0">
                            {group.sessions.length > 1 && (
                              <span
                                className="inline-flex items-center justify-center font-semibold text-[12px] text-foreground/50 bg-black/[0.04] shrink-0"
                                style={{ height: "22px", minWidth: "22px", padding: "0 6px", borderRadius: "8px", border: "1px solid rgba(0,0,0,0.12)" }}
                              >
                                {group.sessions.length}
                              </span>
                            )}
                            <span className="font-semibold text-[15px] text-foreground leading-snug truncate min-w-0">
                              {group.taskName ?? "No task"}
                            </span>
                          </div>
                          {group.projectName && (
                            <p
                              className="text-[12px] text-muted-foreground/55 truncate mt-0.5"
                              style={{ paddingLeft: group.sessions.length > 1 ? "32px" : "0" }}
                            >
                              {group.projectName}
                            </p>
                          )}
                        </div>

                        {/* Right: duration + chevron + restart */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-[15px] text-foreground tabular-nums">
                            {formatShortDuration(group.totalSeconds)}
                          </span>
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            className="flex items-center justify-center"
                          >
                            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                          </motion.span>
                          <motion.button
                            onClick={(e) => handleRestart(group, e)}
                            whileTap={{ scale: 0.95 }}
                            transition={TAP_SPRING}
                            className="p-1.5 rounded-xl hover:bg-primary/10 text-primary/60 hover:text-primary transition-colors"
                            aria-label="Restart this task"
                          >
                            <Play className="w-4 h-4" />
                          </motion.button>
                        </div>

                      </div>
                    </motion.div>

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
                                            <motion.span
                                              animate={{ rotate: expandedNoteId === s.id ? 0 : -90 }}
                                              transition={{ duration: 0.2, ease: "easeOut" }}
                                              className="shrink-0 flex items-center justify-center mt-0.5"
                                            >
                                              <ChevronDown className="w-3 h-3 text-muted-foreground/40" />
                                            </motion.span>
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
                                          onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteId2(null); }}
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
                                    {isConfirmingDelete && !isEditing && confirmDeleteId2 !== s.id && (
                                      <ConfirmBanner
                                        message="Delete this session?"
                                        onConfirm={() => setConfirmDeleteId2(s.id)}
                                        onCancel={() => { setConfirmDeleteId(null); setConfirmDeleteId2(null); }}
                                      />
                                    )}
                                    {confirmDeleteId2 === s.id && !isEditing && (
                                      <ConfirmBanner
                                        message="Hold up a sec! Once it's gone, it's gone for good."
                                        confirmLabel="Yes, delete it"
                                        onConfirm={() => handleDelete(s.id)}
                                        onCancel={() => { setConfirmDeleteId(null); setConfirmDeleteId2(null); }}
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
