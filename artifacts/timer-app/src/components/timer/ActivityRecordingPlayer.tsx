/**
 * ActivityRecordingPlayer
 *
 * WaveSurfer-based audio player used inside the Activity tab's session
 * timeline.  Intentionally minimal — play/pause + tap-to-seek only.
 *
 * Display hierarchy:
 *   • Recording Name (label)  — always shown, e.g. "Recording 1" or custom name
 *   • Note Title (noteTitle)  — shown below the name when set, smaller weight
 *   • Notes text (noteNotes)  — shown as italic quote at the bottom
 *
 * The original code used `noteTitle || label` for a single header line which
 * made the recording name invisible whenever a note title was set.  This
 * version renders them in separate, always-visible rows.
 */

import { useState, useRef, useEffect } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1] as const;

/* ─── Helpers ──────────────────────────────────────────────────── */

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

/* ─── Single-play bus ──────────────────────────────────────────
   Ensures only one recording plays at a time across every
   ActivityRecordingPlayer instance on the page.
──────────────────────────────────────────────────────────────── */
const BUS_EVENT = "flowstate-ws-play";

/* ─── Component ────────────────────────────────────────────────── */

export interface ActivityRecordingPlayerProps {
  url: string;
  durationSeconds: number;
  label?: string | null;
  noteTitle?: string | null;
  noteNotes?: string | null;
  indexInSession: number;
  offsetSeconds?: number;
}

export function ActivityRecordingPlayer({
  url,
  durationSeconds,
  label,
  noteTitle,
  noteNotes,
  indexInSession,
  offsetSeconds,
}: ActivityRecordingPlayerProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const wsRef          = useRef<WaveSurfer | null>(null);
  const instanceId     = useRef(crypto.randomUUID());
  const durationRef    = useRef<number>(durationSeconds);
  const pointerDownRef = useRef<{ x: number; t: number } | null>(null);

  const [playing,  setPlaying]  = useState(false);
  const [duration, setDuration] = useState<number>(durationSeconds);

  /* ── Build WaveSurfer once per URL ─────────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const waveColor     = resolveTailwindColor("bg-border")  || "rgba(0,0,0,0.13)";
    const progressColor = resolveTailwindColor("bg-primary") || "rgba(34,42,58,0.85)";

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
      url,
    });
    wsRef.current = ws;

    /* Manual tap-to-seek */
    const onPointerDown = (e: PointerEvent) => {
      pointerDownRef.current = { x: e.clientX, t: Date.now() };
    };
    const onPointerUp = (e: PointerEvent) => {
      const down = pointerDownRef.current;
      if (!down) return;
      const dx = Math.abs(e.clientX - down.x);
      const dt = Date.now() - down.t;
      pointerDownRef.current = null;
      if (dx < 8 && dt < 400) {
        const rect     = el.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        ws.seekTo(progress);
      }
    };
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointerup",   onPointerUp);

    ws.on("ready", () => {
      const dur = ws.getDuration();
      if (isFinite(dur) && dur > 0) {
        durationRef.current = dur;
        setDuration(dur);
      }
    });
    ws.on("play",   () => setPlaying(true));
    ws.on("pause",  () => setPlaying(false));
    ws.on("finish", () => { setPlaying(false); ws.seekTo(0); });

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerup",   onPointerUp);
      ws.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /* Stop this player when another one starts */
  useEffect(() => {
    const handler = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (id !== instanceId.current) {
        wsRef.current?.pause();
        setPlaying(false);
      }
    };
    window.addEventListener(BUS_EVENT, handler);
    return () => window.removeEventListener(BUS_EVENT, handler);
  }, []);

  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws) return;
    if (playing) {
      ws.pause();
    } else {
      window.dispatchEvent(new CustomEvent(BUS_EVENT, { detail: instanceId.current }));
      ws.play();
    }
  };

  /*
   * Recording Name: always use the stored `label` field.
   * Falls back to "Recording N" only when the label is empty.
   * We intentionally do NOT use noteTitle as a fallback here — that caused
   * the recording name to be invisible whenever a note title was also set.
   */
  const recordingName = label?.trim() || `Recording ${indexInSession + 1}`;

  const noteTitleText = noteTitle?.trim() || null;
  const noteNotesText = noteNotes?.trim() || null;
  const hasReflection = noteTitleText || noteNotesText;

  return (
    <div className="rounded-xl bg-secondary/30 border border-border/20 px-3 py-2.5">

      {/* ── TOP: Recording name (metadata) ─────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <Mic className="w-3 h-3 text-muted-foreground/35 shrink-0" />
        {/* Recording name — primary technical identifier, always visible */}
        <p className="flex-1 min-w-0 text-xs font-medium text-foreground/65 truncate">
          {recordingName}
        </p>
        {offsetSeconds !== undefined && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums shrink-0">
            @{fmtTime(offsetSeconds)}
          </span>
        )}
      </div>

      {/* ── MIDDLE: Waveform + transport ───────────────────────── */}
      <div ref={containerRef} className="w-full cursor-pointer" />

      <div className="flex items-center gap-2 mt-2">
        <motion.button
          onClick={togglePlay}
          whileTap={{ scale: 0.88 }}
          transition={{ duration: 0.08, ease: EASE }}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary/70 hover:bg-primary/20 hover:text-primary transition-colors shrink-0"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing
            ? <Pause className="w-3 h-3" fill="currentColor" />
            : <Play  className="w-3 h-3 ml-0.5" fill="currentColor" />}
        </motion.button>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/50 tabular-nums">
          {fmtTime(duration)}
        </span>
      </div>

      {/* ── BOTTOM: Musical reflection (noteTitle + noteNotes) ─── *
       *  Separated from metadata above by a divider.              *
       *  Both fade + slide up together when present.              */}
      <AnimatePresence initial={false}>
        {hasReflection && (
          <motion.div
            key="reflection"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="border-t border-border/20 mt-3 pt-3 space-y-1"
          >
            {/* Note title — musical label, medium weight */}
            {noteTitleText && (
              <p className="text-[12px] font-medium text-foreground/80 leading-snug">
                {noteTitleText}
              </p>
            )}
            {/* Notes — reflective comment, italic + muted */}
            {noteNotesText && (
              <p className="text-[11px] italic text-muted-foreground/60 leading-relaxed">
                "{noteNotesText}"
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
