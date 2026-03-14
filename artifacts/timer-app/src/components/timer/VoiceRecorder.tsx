import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause, Square } from "lucide-react";
import type { AudioClip } from "@/hooks/use-voice-recorder";
import { motion } from "framer-motion";

const AUDIO_PLAY_EVENT = "flowstate-audio-play";

const TAP_SPRING = { duration: 0.12, ease: "easeOut" as const };

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function fmtTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || isNaN(sec)) return "--:--";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ClipPlayer({ clip }: { clip: AudioClip }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(clip.durationSeconds);
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
    <div className="flex items-center gap-2 flex-1 min-w-0">
      <audio
        ref={audioRef}
        src={clip.url}
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
      <motion.button
        onClick={toggle}
        whileTap={{ scale: 0.92 }}
        transition={TAP_SPRING}
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0 min-w-[32px] min-h-[32px] flex items-center justify-center"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="w-3.5 h-3.5" fill="currentColor" />
        ) : (
          <Play className="w-3.5 h-3.5" fill="currentColor" />
        )}
      </motion.button>
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
  );
}

function RecordingElapsed({ isPaused }: { isPaused: boolean }) {
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

    const interval = setInterval(() => {
      const total = Date.now() - startRef.current - pausedAccumRef.current;
      setElapsed(Math.floor(total / 1000));
    }, 200);

    return () => clearInterval(interval);
  }, [isPaused]);

  return (
    <span className="text-sm font-medium tabular-nums text-destructive/80">
      {formatOffset(elapsed)}
    </span>
  );
}

interface VoiceRecorderProps {
  isActive: boolean;
  isRecording: boolean;
  isPaused: boolean;
  clips: AudioClip[];
  onStartRecording: () => void;
  onStopRecording: () => void;
  onPauseRecording: () => void;
  onResumeRecording: () => void;
  onRenameClip: (index: number, label: string) => void;
}

export function VoiceRecorder({
  isActive,
  isRecording,
  isPaused,
  clips,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  onRenameClip,
}: VoiceRecorderProps) {
  const prevCountRef = useRef(clips.length);
  const [newestIndex, setNewestIndex] = useState<number | null>(null);

  useEffect(() => {
    if (clips.length > prevCountRef.current) {
      setNewestIndex(clips.length - 1);
    }
    prevCountRef.current = clips.length;
  }, [clips.length]);

  if (!isActive && clips.length === 0) return null;

  return (
    <div className="w-full space-y-3">
      {isActive && (
        <div className="flex items-center justify-center">
          {!isRecording ? (
            <motion.button
              onClick={onStartRecording}
              whileTap={{ scale: 0.95 }}
              transition={TAP_SPRING}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-card/90 transition-all text-sm"
            >
              <Mic className="w-4 h-4" />
              Record
            </motion.button>
          ) : (
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20">
              <span className="relative flex h-3 w-3 shrink-0">
                {!isPaused && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                )}
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
              </span>

              <RecordingElapsed isPaused={isPaused} />

              <div className="flex items-center gap-1">
                {!isPaused ? (
                  <motion.button
                    onClick={onPauseRecording}
                    whileTap={{ scale: 0.9 }}
                    transition={TAP_SPRING}
                    className="p-1.5 rounded-full text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Pause recording"
                  >
                    <Pause className="w-4 h-4" />
                  </motion.button>
                ) : (
                  <motion.button
                    onClick={onResumeRecording}
                    whileTap={{ scale: 0.9 }}
                    transition={TAP_SPRING}
                    className="p-1.5 rounded-full text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Resume recording"
                  >
                    <Mic className="w-4 h-4" />
                  </motion.button>
                )}
                <motion.button
                  onClick={onStopRecording}
                  whileTap={{ scale: 0.9 }}
                  transition={TAP_SPRING}
                  className="p-1.5 rounded-full text-destructive/70 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Stop recording"
                >
                  <Square className="w-3.5 h-3.5" fill="currentColor" />
                </motion.button>
              </div>
            </div>
          )}
        </div>
      )}

      {clips.length > 0 && (
        <div className="space-y-1.5">
          {clips.map((clip, i) => (
            <ClipRow
              key={i}
              clip={clip}
              index={i}
              autoEdit={i === newestIndex}
              onRename={(idx, label) => {
                onRenameClip(idx, label);
                if (idx === newestIndex) setNewestIndex(null);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClipRow({
  clip,
  index,
  autoEdit,
  onRename,
}: {
  clip: AudioClip;
  index: number;
  autoEdit: boolean;
  onRename: (index: number, label: string) => void;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [draft, setDraft] = useState(clip.label);
  const didAutoEdit = useRef(autoEdit);

  useEffect(() => {
    if (autoEdit && !didAutoEdit.current) {
      setEditing(true);
      setDraft(clip.label);
      didAutoEdit.current = true;
    }
  }, [autoEdit, clip.label]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== clip.label) {
      onRename(index, trimmed);
    } else {
      setDraft(clip.label);
    }
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 rounded-xl bg-card/40 border border-border/20">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
          {formatOffset(clip.offsetSeconds)}
        </span>
        <Mic className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(clip.label);
                setEditing(false);
              }
            }}
            className="flex-1 min-w-0 text-xs bg-transparent border-b border-border/40 outline-none text-foreground/80 py-0.5"
          />
        ) : (
          <button
            onClick={() => { setDraft(clip.label); setEditing(true); }}
            className="flex-1 min-w-0 text-left text-xs text-foreground/70 hover:text-foreground truncate transition-colors"
            title="Click to rename"
          >
            {clip.label}
          </button>
        )}
      </div>
      <ClipPlayer clip={clip} />
    </div>
  );
}
