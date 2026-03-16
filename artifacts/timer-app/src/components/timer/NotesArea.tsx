import { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import {
  FileText, Mic, Pause, Square, X, Play, Trash2, Pencil,
  BookmarkPlus, ChevronUp, Repeat2, RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import type { AudioClip } from "@/hooks/use-voice-recorder";
import { TaskSelector } from "./TaskSelector";

const EASE = [0.22, 1, 0.36, 1] as const;
const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

/* ─── Helpers ─────────────────────────────────────────────────── */

function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function resolveTailwindColor(cls: string): string {
  try {
    const el = document.createElement("div");
    el.className = cls;
    el.style.cssText = "display:none;position:absolute;pointer-events:none";
    document.body.appendChild(el);
    const color = getComputedStyle(el).backgroundColor;
    document.body.removeChild(el);
    return color || "";
  } catch {
    return "";
  }
}

/* ─── RecordingTimer ──────────────────────────────────────────── */

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

/* ─── SaveForm ────────────────────────────────────────────────── */

interface SaveFormProps {
  clip: AudioClip;
  onSave: (updates: Partial<AudioClip>) => void;
  onClose: () => void;
}

function SaveForm({ clip, onSave, onClose }: SaveFormProps) {
  const [name, setName] = useState(clip.label || "");
  const [title, setTitle] = useState(clip.noteTitle || "");
  const [notes, setNotes] = useState(clip.noteNotes || "");

  const handleSave = () => {
    onSave({
      label: name.trim() || clip.label,
      noteTitle: title.trim() || undefined,
      noteNotes: notes.trim() || undefined,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="save-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 z-40 bg-black/40"
        style={{ willChange: "opacity" }}
        onClick={onClose}
      />
      {/* Sheet */}
      <motion.div
        key="save-sheet"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        style={{ willChange: "transform, opacity" }}
        className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8"
      >
        <div className="w-full max-w-md mx-auto bg-card rounded-3xl shadow-2xl overflow-hidden">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-border/50" />
          </div>
          <div className="px-6 pt-3 pb-6 space-y-4">
            <h3 className="text-base font-semibold text-foreground text-center">
              Practice Notes
            </h3>

            {/* Recording Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Recording Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Recording 1"
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Note Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Note Title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder='e.g. "Shaky Murki", "Weak Komal Ga"'
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Murki at 0:08 unstable. Breath support weak."
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl bg-secondary/50 border border-border/30 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
              />
            </div>

            <motion.button
              onClick={handleSave}
              whileTap={{ scale: 0.97 }}
              className="w-full py-3 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Save
            </motion.button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/* ─── WaveformPlayer ─────────────────────────────────────────── */

interface WaveformPlayerProps {
  clip: AudioClip;
  autoPlay?: boolean;
  onUpdateClip?: (updates: Partial<AudioClip>) => void;
}

function WaveformPlayer({ clip, autoPlay, onUpdateClip }: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsPluginRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const loopRegionRef = useRef<{ start: number; end: number } | null>(null);
  const isLoopingRef = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number>(clip.durationSeconds);
  const [speed, setSpeed] = useState<Speed>(1);
  const [isLooping, setIsLooping] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [showSpeedPicker, setShowSpeedPicker] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const waveColor     = resolveTailwindColor("bg-border")   || "rgba(0,0,0,0.13)";
    const progressColor = resolveTailwindColor("bg-primary")  || "rgba(34,42,58,0.85)";
    const regionColor   = resolveTailwindColor("bg-primary")
      .replace(")", ", 0.12)").replace("rgb(", "rgba(") || "rgba(34,42,58,0.12)";

    const regions = RegionsPlugin.create();
    regionsPluginRef.current = regions;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor,
      progressColor,
      height: 44,
      barWidth: 2.5,
      barGap: 1.5,
      barRadius: 3,
      cursorWidth: 0,
      interact: true,
      url: clip.url,
      plugins: [regions],
    });
    wsRef.current = ws;

    /* Drag-to-select loop region */
    regions.enableDragSelection({ color: regionColor });

    regions.on("region-created", (region) => {
      /* Remove previous regions */
      regions.getRegions().forEach((r) => { if (r.id !== region.id) r.remove(); });
      loopRegionRef.current = { start: region.start, end: region.end };
      isLoopingRef.current = true;
      setIsLooping(true);
      /* When playback leaves the region end, jump back to region start */
      region.on("leave", () => {
        if (isLoopingRef.current) ws.setTime(region.start);
      });
    });

    regions.on("region-updated", (region) => {
      loopRegionRef.current = { start: region.start, end: region.end };
    });

    regions.on("region-removed", () => {
      if (regions.getRegions().length === 0) {
        loopRegionRef.current = null;
        isLoopingRef.current = false;
        setIsLooping(false);
      }
    });

    ws.on("ready", () => {
      const dur = ws.getDuration();
      if (isFinite(dur) && dur > 0) setDuration(dur);
      if (autoPlay) ws.play();
    });
    ws.on("play",   () => setPlaying(true));
    ws.on("pause",  () => setPlaying(false));
    ws.on("finish", () => setPlaying(false));

    return () => { ws.destroy(); };
  }, [clip.url, autoPlay]);

  /* Sync speed */
  useEffect(() => {
    wsRef.current?.setPlaybackRate(speed, true);
  }, [speed]);

  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (isLooping && loopRegionRef.current && !playing) {
      /* Start from loop start if not inside the loop */
      const cur = ws.getCurrentTime();
      const { start, end } = loopRegionRef.current;
      if (cur < start || cur > end) ws.setTime(start);
      ws.play();
    } else {
      ws.playPause();
    }
  };

  const clearLoop = () => {
    regionsPluginRef.current?.getRegions().forEach((r) => r.remove());
  };

  return (
    <div className="space-y-2">
      {/* Waveform canvas — drag across to create a loop region */}
      <div ref={containerRef} className="w-full" />

      {/* Loop active indicator */}
      <AnimatePresence>
        {isLooping && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 px-0.5">
              <Repeat2 className="w-3 h-3 text-primary/50" />
              <span className="text-[11px] text-primary/60 font-medium">Loop active</span>
              <button
                onClick={clearLoop}
                className="flex items-center gap-0.5 text-[11px] text-muted-foreground/40 hover:text-destructive/60 transition-colors ml-1"
              >
                <X className="w-2.5 h-2.5" />
                Clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls: [play] [speed] ──── [save icon] [duration] */}
      <div className="flex items-center gap-2">
        {/* Play / Pause */}
        <motion.button
          onClick={togglePlay}
          whileTap={{ scale: 0.88 }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing
            ? <Pause className="w-3 h-3" fill="currentColor" />
            : <Play  className="w-3 h-3 ml-0.5" fill="currentColor" />}
        </motion.button>

        {/* Speed picker */}
        <div className="relative">
          <motion.button
            onClick={() => setShowSpeedPicker((v) => !v)}
            whileTap={{ scale: 0.92 }}
            className={`flex items-center gap-0.5 text-[11px] font-semibold px-2 py-1 rounded-lg transition-colors ${
              speed !== 1
                ? "text-primary bg-primary/10"
                : "text-muted-foreground/55 hover:text-foreground/70 hover:bg-foreground/5"
            }`}
          >
            {speed}×
            <ChevronUp className={`w-2.5 h-2.5 transition-transform ${showSpeedPicker ? "" : "rotate-180"}`} />
          </motion.button>

          <AnimatePresence>
            {showSpeedPicker && (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.95 }}
                transition={{ duration: 0.13, ease: EASE }}
                className="absolute left-0 bottom-full mb-1.5 z-20 bg-popover border border-border/40 rounded-2xl shadow-xl overflow-hidden py-1.5 min-w-[80px]"
              >
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setSpeed(s); setShowSpeedPicker(false); }}
                    className={`flex items-center justify-between w-full px-4 py-1.5 text-xs transition-colors ${
                      s === speed
                        ? "text-primary font-bold bg-primary/8"
                        : "text-foreground/70 hover:bg-muted/60"
                    }`}
                  >
                    {s}×
                    {s === 1 && <span className="text-[9px] text-muted-foreground/40 ml-2">default</span>}
                  </button>
                ))}
                {speed !== 1 && (
                  <button
                    onClick={() => { setSpeed(1); setShowSpeedPicker(false); }}
                    className="flex items-center gap-1 w-full px-4 py-1.5 text-xs text-muted-foreground/50 hover:text-foreground/60 border-t border-border/20 mt-1 pt-2 transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5" /> Reset
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex-1" />

        {/* Practice notes save icon */}
        <motion.button
          onClick={() => setShowSaveForm(true)}
          whileTap={{ scale: 0.88 }}
          className={`flex items-center gap-1 transition-colors ${
            clip.noteTitle
              ? "text-primary/60 hover:text-primary/80"
              : "text-muted-foreground/30 hover:text-primary/50"
          }`}
          title={clip.noteTitle ? `Note: ${clip.noteTitle}` : "Add practice notes"}
        >
          {clip.noteTitle ? (
            <span className="text-[10px] font-medium max-w-[72px] truncate">{clip.noteTitle}</span>
          ) : (
            <BookmarkPlus className="w-3.5 h-3.5" />
          )}
        </motion.button>

        {/* Duration */}
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {fmtTime(duration)}
        </span>
      </div>

      {/* Save form */}
      <AnimatePresence>
        {showSaveForm && (
          <SaveForm
            clip={clip}
            onSave={(updates) => { onUpdateClip?.(updates); setShowSaveForm(false); }}
            onClose={() => setShowSaveForm(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── NotesArea ──────────────────────────────────────────────── */

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
  onUpdateClip: (index: number, updates: Partial<AudioClip>) => void;
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
  onUpdateClip,
  onDeleteClip,
  onCancelRecording,
}: NotesAreaProps) {
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  /* Track which clip index should auto-play (the most recently added one) */
  const prevClipsLenRef = useRef(clips.length);
  const [autoPlayIndex, setAutoPlayIndex] = useState<number | null>(null);
  useEffect(() => {
    if (clips.length > prevClipsLenRef.current) {
      setAutoPlayIndex(clips.length - 1);
    }
    prevClipsLenRef.current = clips.length;
  }, [clips.length]);

  useEffect(() => {
    if (!isRecording) setShowCancelConfirm(false);
  }, [isRecording]);

  const commitRename = (index: number) => {
    const trimmed = editDraft.trim();
    if (trimmed) onRenameClip(index, trimmed);
    setEditingIndex(null);
  };

  const confirmDelete = () => {
    if (pendingDeleteIndex !== null) {
      onDeleteClip(pendingDeleteIndex);
      setPendingDeleteIndex(null);
    }
  };

  const SHEET_EASE = EASE;

  return (
    <>
    <div className="w-full glass-panel rounded-3xl p-1 overflow-hidden transition-all duration-300 focus-within:ring-4 focus-within:ring-primary/10">
      <div className="bg-card/50 rounded-[1.35rem] p-6 h-full flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center mb-4">
          <div className="flex items-center gap-2 text-muted-foreground font-medium flex-1">
            <FileText className="w-4 h-4" />
            <span>Session Notes & Goals</span>
          </div>

          {!isRecording ? (
            <motion.button
              onClick={onStartRecording}
              whileTap={{ scale: 0.88 }}
              className="w-8 h-8 rounded-full flex items-center justify-center bg-foreground/[0.06] hover:bg-foreground/[0.10] text-foreground/65 hover:text-foreground/90 transition-colors shrink-0"
              aria-label="Start voice recording"
              title="Record a voice note"
            >
              <Mic className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.span
              className="relative flex items-center justify-center h-5 w-5 mr-0.5 shrink-0"
              aria-label="Recording active"
            >
              <motion.span
                className="absolute inline-flex rounded-full bg-red-500"
                style={{ width: 10, height: 10 }}
                animate={!isPaused ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={!isPaused ? { duration: 1.2, ease: "easeInOut", repeat: Infinity } : {}}
              />
            </motion.span>
          )}
        </div>

        {/* ── Inline recording controls ── */}
        <AnimatePresence initial={false}>
          {isRecording && (
            <motion.div
              key="rec-ui"
              initial={{ height: 0, marginBottom: 0 }}
              animate={{ height: "auto", marginBottom: 16 }}
              exit={{ height: 0, marginBottom: 0 }}
              transition={{ duration: 0.15, ease: EASE }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 6, opacity: 0 }}
                transition={{ duration: 0.17, ease: EASE }}
                style={{ willChange: "transform, opacity" }}
                className="flex items-center gap-2 rounded-2xl bg-destructive/8 border border-destructive/15 px-4 py-3"
              >
                <RecordingTimer isPaused={isPaused} />
                <div className="flex-1" />

                <motion.button
                  onClick={isPaused ? onResumeRecording : onPauseRecording}
                  whileTap={{ scale: 0.88 }}
                  className="p-2 rounded-lg text-destructive/55 hover:text-destructive hover:bg-destructive/12 transition-colors"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                >
                  {isPaused ? <Mic className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </motion.button>

                <motion.button
                  onClick={onStopRecording}
                  whileTap={{ scale: 0.88 }}
                  className="p-2 rounded-lg text-destructive/55 hover:text-destructive hover:bg-destructive/12 transition-colors"
                  aria-label="Stop and save recording"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </motion.button>

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
                        onClick={() => { setShowCancelConfirm(false); onCancelRecording(); }}
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
                    >
                      <X className="w-3.5 h-3.5" />
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
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
                  {/* Row 1: mic + label + rename + delete */}
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
                        onClick={() => { setEditDraft(clip.label); setEditingIndex(i); }}
                        className="flex-1 text-left text-xs text-foreground/65 hover:text-foreground truncate transition-colors"
                        title="Tap to rename"
                      >
                        {clip.label || `Recording ${i + 1}`}
                      </button>
                    )}

                    <button
                      onClick={() => { setEditDraft(clip.label); setEditingIndex(i); }}
                      className="p-1 rounded text-muted-foreground/25 hover:text-muted-foreground/60 transition-colors shrink-0"
                      aria-label="Rename recording"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setPendingDeleteIndex(i)}
                      className="p-1 rounded text-muted-foreground/25 hover:text-destructive/60 transition-colors shrink-0"
                      aria-label="Delete recording"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Row 2: waveform + controls */}
                  <WaveformPlayer
                    clip={clip}
                    autoPlay={autoPlayIndex === i}
                    onUpdateClip={(updates) => onUpdateClip(i, updates)}
                  />

                  {/* Note title badge */}
                  {clip.noteNotes && (
                    <p className="text-[11px] text-muted-foreground/55 leading-relaxed border-t border-border/20 pt-2 mt-1">
                      {clip.noteNotes}
                    </p>
                  )}
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

    {/* ── Delete confirmation sheet ── */}
    <AnimatePresence>
      {pendingDeleteIndex !== null && (
        <>
          <motion.div
            key="delete-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="fixed inset-0 z-40 bg-black/40"
            style={{ willChange: "opacity" }}
            onClick={() => setPendingDeleteIndex(null)}
          />
          <motion.div
            key="delete-sheet"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            transition={{ duration: 0.2, ease: SHEET_EASE }}
            style={{ willChange: "transform, opacity" }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8 pt-0"
          >
            <div className="w-full max-w-md mx-auto bg-card rounded-3xl shadow-2xl overflow-hidden">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-border/50" />
              </div>
              <div className="px-6 pt-4 pb-6">
                <h3 className="text-base font-semibold text-foreground text-center mb-2">
                  Delete this recording?
                </h3>
                <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                  This audio note will be permanently removed.
                </p>
                <div className="flex flex-col gap-2">
                  <motion.button
                    onClick={confirmDelete}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3 rounded-2xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm transition-colors"
                  >
                    Delete Recording
                  </motion.button>
                  <motion.button
                    onClick={() => setPendingDeleteIndex(null)}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-3 rounded-2xl bg-secondary hover:bg-secondary/80 text-foreground/70 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
}
