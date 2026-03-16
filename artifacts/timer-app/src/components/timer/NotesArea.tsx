import { useState, useRef, useEffect } from "react";
import { FileText, Mic, Pause, Square, X, Play, Trash2, Pencil } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import type { AudioClip } from "@/hooks/use-voice-recorder";
import { TaskSelector } from "./TaskSelector";

const EASE = [0.22, 1, 0.36, 1] as const;

function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function RecordingTimer({ isPaused }: { isPaused: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const pausedAccumRef = useRef(0);
  const pauseStartRef = useRef(0);

  useEffect(() => {
    startRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartRef.current = 0;
    setElapsed(0);
  }, []);

  useEffect(() => {
    if (isPaused) {
      pauseStartRef.current = Date.now();
      return;
    }
    if (pauseStartRef.current > 0) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
    }
    const id = setInterval(() => {
      const total = Date.now() - startRef.current - pausedAccumRef.current;
      setElapsed(Math.floor(total / 1000));
    }, 200);
    return () => clearInterval(id);
  }, [isPaused]);

  const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return (
    <span className="text-sm font-mono font-semibold tabular-nums text-destructive/80">
      {m}:{s}
    </span>
  );
}

function ClipPlayer({ clip }: { clip: AudioClip }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(clip.durationSeconds);

  const toggle = async () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setPlaying(true);
      } catch {}
    }
  };

  return (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={clip.url}
        preload="metadata"
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={() =>
          audioRef.current && setCurrentTime(audioRef.current.currentTime)
        }
        onLoadedMetadata={() => {
          if (
            audioRef.current &&
            isFinite(audioRef.current.duration) &&
            audioRef.current.duration > 0
          ) {
            setDuration(audioRef.current.duration);
          }
        }}
        className="hidden"
      />
      <motion.button
        onClick={toggle}
        whileTap={{ scale: 0.88 }}
        className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary transition-colors shrink-0"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="w-3 h-3" fill="currentColor" />
        ) : (
          <Play className="w-3 h-3 ml-0.5" fill="currentColor" />
        )}
      </motion.button>
      <input
        type="range"
        min={0}
        max={duration ?? 1}
        step={0.1}
        value={currentTime}
        onChange={(e) => {
          const t = Number(e.target.value);
          if (audioRef.current) {
            audioRef.current.currentTime = t;
            setCurrentTime(t);
          }
        }}
        className="flex-1 h-1 rounded-full appearance-none bg-border/30 cursor-pointer accent-primary"
      />
      <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0 min-w-[2.5rem] text-right">
        {fmtTime(duration)}
      </span>
    </div>
  );
}

interface NotesAreaProps {
  value: string;
  onChange: (val: string) => void;
  selectedTask: Task | null;
  onSelectTask: (task: Task | null) => void;
  isRecording: boolean;
  isPaused: boolean;
  clips: AudioClip[];
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onRenameClip: (index: number, label: string) => void;
  onDeleteClip: (index: number) => void;
  onCancelRecording: () => void;
}

export function NotesArea({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  isRecording,
  isPaused,
  clips,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onRenameClip,
  onDeleteClip,
  onCancelRecording,
}: NotesAreaProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    if (!isRecording) setShowCancelConfirm(false);
  }, [isRecording]);

  const commitRename = (index: number) => {
    const trimmed = editDraft.trim();
    if (trimmed) onRenameClip(index, trimmed);
    setEditingIndex(null);
  };

  return (
    <div className="w-full glass-panel rounded-3xl p-1 overflow-hidden transition-all duration-300 focus-within:ring-4 focus-within:ring-primary/10">
      <div className="bg-card/50 rounded-[1.35rem] p-6 h-full flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center mb-4">
          <div className="flex items-center gap-2 text-muted-foreground font-medium flex-1">
            <FileText className="w-4 h-4" />
            <span>Session Notes & Goals</span>
          </div>

          {/* Mic button / live indicator */}
          {!isRecording ? (
            <motion.button
              onClick={onStartRecording}
              whileTap={{ scale: 0.88 }}
              className="p-1.5 rounded-lg text-muted-foreground/35 hover:text-primary/70 hover:bg-primary/8 transition-colors"
              aria-label="Start voice recording"
              title="Record a voice note"
            >
              <Mic className="w-4 h-4" />
            </motion.button>
          ) : (
            <span className="relative flex h-2.5 w-2.5 mr-0.5" aria-label="Recording active">
              {!isPaused && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-70" />
              )}
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-destructive" />
            </span>
          )}
        </div>

        {/* ── Inline recording controls ── */}
        <AnimatePresence initial={false}>
          {isRecording && (
            <motion.div
              key="rec-ui"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 rounded-2xl bg-destructive/8 border border-destructive/15 px-4 py-3">
                {/* Elapsed timer */}
                <RecordingTimer isPaused={isPaused} />

                <div className="flex-1" />

                {/* Pause / Resume */}
                <motion.button
                  onClick={isPaused ? onResumeRecording : onPauseRecording}
                  whileTap={{ scale: 0.88 }}
                  className="p-2 rounded-lg text-destructive/55 hover:text-destructive hover:bg-destructive/12 transition-colors"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                  title={isPaused ? "Resume" : "Pause"}
                >
                  {isPaused ? <Mic className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </motion.button>

                {/* Stop → save */}
                <motion.button
                  onClick={onStopRecording}
                  whileTap={{ scale: 0.88 }}
                  className="p-2 rounded-lg text-destructive/55 hover:text-destructive hover:bg-destructive/12 transition-colors"
                  aria-label="Stop and save recording"
                  title="Stop & save"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </motion.button>

                {/* Cancel */}
                <AnimatePresence mode="wait">
                  {showCancelConfirm ? (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.12 }}
                      className="flex items-center gap-1 ml-1"
                    >
                      <button
                        onClick={() => {
                          setShowCancelConfirm(false);
                          onCancelRecording();
                        }}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold text-destructive bg-destructive/15 hover:bg-destructive/25 transition-colors"
                      >
                        Discard
                      </button>
                      <button
                        onClick={() => setShowCancelConfirm(false)}
                        className="px-2 py-1 rounded-md text-[11px] font-medium text-muted-foreground bg-secondary/50 hover:bg-secondary/70 transition-colors"
                      >
                        Keep
                      </button>
                    </motion.div>
                  ) : (
                    <motion.button
                      key="cancel-btn"
                      onClick={() => setShowCancelConfirm(true)}
                      whileTap={{ scale: 0.88 }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="p-2 rounded-lg text-muted-foreground/35 hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                      aria-label="Discard recording"
                      title="Discard recording"
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Saved clips ── */}
        <AnimatePresence initial={false}>
          {clips.length > 0 && (
            <motion.div
              key="clips"
              initial={{ opacity: 0, height: 0, marginBottom: 0 }}
              animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="overflow-hidden space-y-2"
            >
              {clips.map((clip, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  className="rounded-xl bg-secondary/30 border border-border/20 px-3 py-2.5 space-y-2"
                >
                  {/* Label row */}
                  <div className="flex items-center gap-2">
                    <Mic className="w-3 h-3 text-muted-foreground/35 shrink-0" />

                    {editingIndex === i ? (
                      <input
                        autoFocus
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onBlur={() => commitRename(i)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename(i);
                          if (e.key === "Escape") setEditingIndex(null);
                        }}
                        className="flex-1 text-xs bg-transparent border-b border-primary/40 outline-none text-foreground/80 pb-0.5"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditDraft(clip.label);
                          setEditingIndex(i);
                        }}
                        className="flex-1 text-left text-xs text-foreground/65 hover:text-foreground truncate transition-colors"
                        title="Tap to rename"
                      >
                        {clip.label || `Recording ${i + 1}`}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setEditDraft(clip.label);
                        setEditingIndex(i);
                      }}
                      className="p-1 rounded text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors shrink-0"
                      aria-label="Rename recording"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDeleteClip(i)}
                      className="p-1 rounded text-muted-foreground/25 hover:text-destructive/60 transition-colors shrink-0"
                      aria-label="Delete recording"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Player row */}
                  <ClipPlayer clip={clip} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Textarea ── */}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What are you aiming to accomplish? Drop your thoughts here..."
          className="w-full flex-1 min-h-[120px] bg-transparent border-none resize-none outline-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed"
        />

        {/* ── Divider + Task selector ── */}
        <div className="h-px w-full bg-border/40 my-4" />
        <TaskSelector selectedTask={selectedTask} onSelectTask={onSelectTask} />
      </div>
    </div>
  );
}
