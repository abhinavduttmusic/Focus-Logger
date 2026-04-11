import { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/plugins/regions";
import {
  FileText, Mic, Pause, Square, X, Play, Trash2, Pencil,
  BookmarkPlus, Repeat2, Rewind, FastForward, ChevronUp,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import type { AudioClip } from "@/hooks/use-voice-recorder";
import { TaskSelector } from "./TaskSelector";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Steps available for speed control — matches Modacity-style stepped feel */
const SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;
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

function toRgba(color: string, alpha: number): string {
  if (!color) return `rgba(34,42,58,${alpha})`;
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return `rgba(34,42,58,${alpha})`;
  return `rgba(${match[1]},${match[2]},${match[3]},${alpha})`;
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

/* ─── SaveForm ─────────────────────────────────────────────────
   Rendered at the fragment root (outside glass-panel) so that
   the fixed backdrop/sheet are never clipped by a stacking context
   created by backdrop-filter inside the card.
──────────────────────────────────────────────────────────────── */

interface SaveFormProps {
  clip: AudioClip;
  onSave: (updates: Partial<AudioClip>) => void;
  onClose: () => void;
}

function SaveForm({ clip, onSave, onClose }: SaveFormProps) {
  const [name, setName]   = useState(clip.label || "");
  const [title, setTitle] = useState(clip.noteTitle || "");
  const [notes, setNotes] = useState(clip.noteNotes || "");

  const handleSave = () => {
    onSave({
      label:      name.trim()  || clip.label,
      noteTitle:  title.trim() || undefined,
      noteNotes:  notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <>
      <motion.div
        key="save-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onClose}
      />
      <motion.div
        key="save-sheet"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0,  opacity: 1 }}
        exit={{ y: 12,    opacity: 0 }}
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
  /**
   * When true the player will start playback automatically as soon as the
   * waveform has decoded.  A ~150 ms delay before play() prevents audio jank
   * on freshly-created blob URLs.
   */
  autoPlay?: boolean;
  onUpdateClip?: (updates: Partial<AudioClip>) => void;
  onOpenSaveForm?: () => void;
}

function WaveformPlayer({ clip, autoPlay, onUpdateClip: _onUpdateClip, onOpenSaveForm }: WaveformPlayerProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const wsRef          = useRef<WaveSurfer | null>(null);
  const regionsRef     = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null);
  const durationRef    = useRef<number>(clip.durationSeconds);
  const loopRegionRef  = useRef<{ start: number; end: number } | null>(null);
  const isLoopingRef   = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);

  /**
   * Use a ref so the ready-handler closure captures the latest value even if
   * autoPlay changes between mount and when WaveSurfer finishes decoding.
   * We only want to auto-play once, so we clear the ref after the first play.
   */
  const autoPlayRef    = useRef(autoPlay ?? false);
  useEffect(() => { autoPlayRef.current = autoPlay ?? false; }, [autoPlay]);

  const [playing,   setPlaying]   = useState(false);
  const [duration,  setDuration]  = useState<number>(clip.durationSeconds);
  const [speed,     setSpeed]     = useState<Speed>(1.0);
  const [isLooping, setIsLooping] = useState(false);

  /* ── Build WaveSurfer once per URL ─────────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const waveColor     = resolveTailwindColor("bg-border")  || "rgba(0,0,0,0.13)";
    const progressColor = resolveTailwindColor("bg-primary") || "rgba(34,42,58,0.85)";
    const regionColor   = toRgba(resolveTailwindColor("bg-primary"), 0.12);

    const regions = RegionsPlugin.create();
    regionsRef.current = regions;

    /*
     * interact: false — we handle click-to-seek ourselves so it is not
     * blocked by RegionsPlugin's drag-selection event listeners.
     *
     * WaveSurfer v7 ties its progress bar update directly to the Web Audio
     * clock via its own internal requestAnimationFrame loop, so the fill
     * stays perfectly in sync with audio.currentTime at 60 fps.
     */
    const ws = WaveSurfer.create({
      container: el,
      waveColor,
      progressColor,
      height: 44,
      barWidth: 2.5,
      barGap: 1.5,
      barRadius: 3,
      cursorWidth: 0,
      interact: false,
      url: clip.url,
      plugins: [regions],
    });
    wsRef.current = ws;

    /* ── Manual click-to-seek ──────────────────────────────────
       Discriminate tap (seek) vs drag (region select) via pointer
       movement + elapsed time between pointerdown and pointerup. */
    const onPointerDown = (e: PointerEvent) => {
      pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    };
    const onPointerUp = (e: PointerEvent) => {
      const down = pointerDownRef.current;
      if (!down) return;
      const dx  = Math.abs(e.clientX - down.x);
      const dt  = Date.now() - down.t;
      pointerDownRef.current = null;
      if (dx < 8 && dt < 400) {
        const rect     = el.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        ws.seekTo(progress);
      }
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup",   onPointerUp);

    /* ── Drag-to-select loop region ──────────────────────────── */
    regions.enableDragSelection({ color: regionColor });

    regions.on("region-created", (region) => {
      regions.getRegions().forEach((r) => { if (r.id !== region.id) r.remove(); });
      loopRegionRef.current = { start: region.start, end: region.end };
      isLoopingRef.current  = true;
      setIsLooping(true);
    });

    regions.on("region-updated", (region) => {
      loopRegionRef.current = { start: region.start, end: region.end };
    });

    regions.on("region-removed", () => {
      if (regions.getRegions().length === 0) {
        loopRegionRef.current = null;
        isLoopingRef.current  = false;
        setIsLooping(false);
      }
    });

    /* ── Loop enforcement — checked on every timeupdate ─────── */
    ws.on("timeupdate", (currentTime) => {
      const loop = loopRegionRef.current;
      if (isLoopingRef.current && loop) {
        if (currentTime >= loop.end) {
          const dur = durationRef.current;
          if (dur > 0) ws.seekTo(loop.start / dur);
        }
      }
    });

    ws.on("ready", () => {
      const dur = ws.getDuration();
      if (isFinite(dur) && dur > 0) {
        durationRef.current = dur;
        setDuration(dur);
      }

      /*
       * Auto-play: triggered when the user just finished recording.
       * A 150 ms delay lets the browser settle after blob-URL creation
       * and prevents audio glitches on low-end devices.
       */
      if (autoPlayRef.current) {
        autoPlayRef.current = false;
        setTimeout(() => { wsRef.current?.play(); }, 150);
      }
    });

    ws.on("play",   () => setPlaying(true));
    ws.on("pause",  () => setPlaying(false));
    ws.on("finish", () => {
      setPlaying(false);
      /* Reset playhead to start so the next tap plays from the beginning */
      ws.seekTo(0);
    });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup",   onPointerUp);
      ws.destroy();
    };
  // clip.url is stable per-clip; re-mounting would lose waveform state
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.url]);

  /* Sync playback rate whenever speed state changes */
  useEffect(() => {
    wsRef.current?.setPlaybackRate(speed, true);
  }, [speed]);

  /* ── Playback control ──────────────────────────────────────── */

  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (isLooping && loopRegionRef.current && !playing) {
      const dur = durationRef.current;
      const cur = ws.getCurrentTime();
      const { start, end } = loopRegionRef.current;
      if (dur > 0 && (cur < start || cur >= end)) {
        ws.seekTo(start / dur);
      }
      ws.play();
    } else {
      ws.playPause();
    }
  };

  /* ── Speed step buttons ────────────────────────────────────── */

  const currentSpeedIndex = SPEEDS.indexOf(speed);

  const decreaseSpeed = () => {
    if (currentSpeedIndex > 0) {
      setSpeed(SPEEDS[currentSpeedIndex - 1]);
    }
  };

  const increaseSpeed = () => {
    if (currentSpeedIndex < SPEEDS.length - 1) {
      setSpeed(SPEEDS[currentSpeedIndex + 1]);
    }
  };

  const clearLoop = () => {
    regionsRef.current?.getRegions().forEach((r) => r.remove());
  };

  const atMinSpeed = currentSpeedIndex === 0;
  const atMaxSpeed = currentSpeedIndex === SPEEDS.length - 1;

  return (
    <div className="space-y-2">
      {/* Waveform canvas */}
      <div ref={containerRef} className="w-full cursor-pointer" />

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

      {/*
        Transport controls — Modacity-inspired layout:
        [ ⏪ ]   [ ▶/⏸ ]   [ ⏩ ]   [ 1.0× ]   ────   [ note icon ]   [ dur ]
      */}
      <div className="flex items-center gap-2.5">

        {/* ⏪ Decrease speed */}
        <motion.button
          onClick={decreaseSpeed}
          disabled={atMinSpeed}
          whileTap={!atMinSpeed ? { scale: 0.88 } : {}}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="flex items-center justify-center w-6 h-6 rounded-full transition-colors disabled:opacity-25 disabled:pointer-events-none text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/6"
          aria-label="Decrease speed"
        >
          <Rewind className="w-3.5 h-3.5" fill="currentColor" />
        </motion.button>

        {/* ▶ / ⏸  Play / Pause */}
        <motion.button
          onClick={togglePlay}
          whileTap={{ scale: 0.88, opacity: 0.75 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary/75 hover:bg-primary/18 hover:text-primary transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={playing ? "pause" : "play"}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.12, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              {playing
                ? <Pause className="w-3.5 h-3.5" fill="currentColor" />
                : <Play  className="w-3.5 h-3.5 ml-0.5" fill="currentColor" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {/* ⏩ Increase speed */}
        <motion.button
          onClick={increaseSpeed}
          disabled={atMaxSpeed}
          whileTap={!atMaxSpeed ? { scale: 0.88 } : {}}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="flex items-center justify-center w-6 h-6 rounded-full transition-colors disabled:opacity-25 disabled:pointer-events-none text-muted-foreground/50 hover:text-foreground/80 hover:bg-foreground/6"
          aria-label="Increase speed"
        >
          <FastForward className="w-3.5 h-3.5" fill="currentColor" />
        </motion.button>

        {/* Speed label — scale-flashes on change via key-based remount */}
        <div className="relative w-8 flex items-center justify-center overflow-visible">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={speed}
              initial={{ opacity: 0, scale: 0.75 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={`text-[11px] font-semibold tabular-nums ${
                speed !== 1.0 ? "text-primary/70" : "text-muted-foreground/45"
              }`}
            >
              {speed}×
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="flex-1" />

        {/* Practice notes icon — opens SaveForm via parent callback */}
        <motion.button
          onClick={() => onOpenSaveForm?.()}
          whileTap={{ scale: 0.88 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className={`flex items-center gap-1 transition-colors ${
            clip.noteTitle
              ? "text-primary/60 hover:text-primary/80"
              : "text-muted-foreground/30 hover:text-primary/50"
          }`}
          title={clip.noteTitle ? `Note: ${clip.noteTitle}` : "Add practice notes"}
        >
          {clip.noteTitle
            ? <span className="text-[10px] font-medium max-w-[72px] truncate">{clip.noteTitle}</span>
            : <BookmarkPlus className="w-3.5 h-3.5" />}
        </motion.button>

        {/* Duration */}
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}

/* ─── NotesArea ──────────────────────────────────────────────── */

interface NotesAreaProps {
  value: string;
  onChange: (val: string) => void;
  selectedTask: Task | null;
  onSelectTask: (task: Task | null) => void;
  isSessionActive: boolean;
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
  onToggleExpand: () => void;
  isExpanded: boolean;
}

export function NotesArea({
  value,
  onChange,
  selectedTask,
  onSelectTask,
  isSessionActive,
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
  onToggleExpand,
  isExpanded,
}: NotesAreaProps) {
  const [showCancelConfirm,  setShowCancelConfirm]  = useState(false);
  const [editingIndex,       setEditingIndex]        = useState<number | null>(null);
  const [editDraft,          setEditDraft]           = useState("");
  const [pendingDeleteIndex, setPendingDeleteIndex]  = useState<number | null>(null);
  /**
   * saveFormClipIndex — the index of the clip whose SaveForm is open.
   * Lifted here so SaveForm renders outside the glass-panel's
   * backdrop-filter stacking context (required for correct fixed-backdrop).
   */
  const [saveFormClipIndex,  setSaveFormClipIndex]   = useState<number | null>(null);

  /** Ref for the unified recordings + notes scroll container */
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom when a new clip is added */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [clips.length]);

  /* Track auto-play for newly-completed recordings */
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

  return (
    <>
    {/* ─────────────────────── Card ─────────────────────────── */}
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', borderRadius: '1.5rem', padding: '4px', boxSizing: 'border-box' }} className="glass-panel focus-within:ring-4 focus-within:ring-primary/10">
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', borderRadius: '1.35rem', padding: '16px', boxSizing: 'border-box' }} className="bg-card/50">

        {/* Header */}
        <div className="flex items-center mb-4">
          <div className="flex items-center gap-2 text-muted-foreground font-medium flex-1">
            <FileText className="w-4 h-4" />
            <span>Session Notes & Goals</span>
          </div>

          {/* Chevron toggle — tap to expand / collapse the card */}
          <motion.button
            onClick={onToggleExpand}
            whileTap={{ scale: 0.88 }}
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/50 hover:text-foreground/80 transition-colors shrink-0"
            aria-label={isExpanded ? "Collapse notes" : "Expand notes"}
          >
            <ChevronUp className="w-4 h-4" />
          </motion.button>
        </div>

        {/* Inline recording controls */}
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
                animate={{ y: 0,  opacity: 1 }}
                exit={{ y: 6,     opacity: 0 }}
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

        {/* ── Unified scroll container: recordings + notes scroll together ── */}
        <div
          ref={scrollRef}
          className="notes-content-scroll"
          style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '2px', display: 'flex', flexDirection: 'column' }}
        >
          {/* Saved clips */}
          <AnimatePresence initial={false}>
            {clips.length > 0 && (
              <motion.div
                key="clips"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 16 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="space-y-2"
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
                    {/* Clip header: mic icon + editable label + rename + delete */}
                    <div className="flex items-center gap-2">
                      <Mic className="w-3 h-3 text-muted-foreground/35 shrink-0" />

                      {editingIndex === i ? (
                        <input
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onBlur={() => commitRename(i)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")  commitRename(i);
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

                    {/* Waveform + controls */}
                    <WaveformPlayer
                      clip={clip}
                      autoPlay={autoPlayIndex === i}
                      onUpdateClip={(updates) => onUpdateClip(i, updates)}
                      onOpenSaveForm={() => setSaveFormClipIndex(i)}
                    />

                    {/* Notes preview under the clip */}
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

          {/* Text notes textarea — grows with content, no internal scroll */}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="What are you aiming to accomplish? Drop your thoughts here..."
            className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed"
            style={{ flex: 1, minHeight: '120px', marginTop: clips.length > 0 ? 0 : undefined, resize: 'none', width: '100%' }}
          />
        </div>

        {/* Divider + mic + task selector — pinned to bottom of flex column */}
        <div style={{ flexShrink: 0 }}>
          <div className="h-px w-full bg-border/40 my-4" />
          <div className="flex items-center gap-2">
          {/* Mic button — moved from header to here */}
          {!isRecording ? (
            <motion.button
              onClick={isSessionActive ? onStartRecording : undefined}
              whileTap={isSessionActive ? { scale: 0.88 } : {}}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shrink-0 ${
                isSessionActive
                  ? "bg-foreground/[0.06] hover:bg-foreground/[0.10] text-foreground/65 hover:text-foreground/90 cursor-pointer"
                  : "bg-foreground/[0.03] text-foreground/20 cursor-not-allowed opacity-50"
              }`}
              aria-label="Start voice recording"
              title={isSessionActive ? "Record a voice note" : "Start a session to record"}
              disabled={!isSessionActive}
            >
              <Mic className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.span
              className="relative flex items-center justify-center h-8 w-8 shrink-0"
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
          <TaskSelector selectedTask={selectedTask} onSelectTask={onSelectTask} />
          </div>
        </div>
      </div>
    </div>

    {/* ── SaveForm bottom sheet ─────────────────────────────────
        Rendered here, outside glass-panel, so the fixed
        backdrop is in the root stacking context.              */}
    <AnimatePresence>
      {saveFormClipIndex !== null && clips[saveFormClipIndex] && (
        <SaveForm
          key={`save-form-${saveFormClipIndex}`}
          clip={clips[saveFormClipIndex]}
          onSave={(updates) => {
            onUpdateClip(saveFormClipIndex, updates);
            setSaveFormClipIndex(null);
          }}
          onClose={() => setSaveFormClipIndex(null)}
        />
      )}
    </AnimatePresence>

    {/* ── Delete confirmation sheet ───────────────────────────── */}
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
            onClick={() => setPendingDeleteIndex(null)}
          />
          <motion.div
            key="delete-sheet"
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0,  opacity: 1 }}
            exit={{ y: 12,    opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ willChange: "transform, opacity" }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8"
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
