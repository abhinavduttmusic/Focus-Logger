import { useState, useRef, useEffect } from "react";
import { Mic, Play, Pause } from "lucide-react";
import type { AudioClip } from "@/hooks/use-voice-recorder";

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ClipPlayer({ clip }: { clip: AudioClip }) {
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
    <>
      <audio
        ref={audioRef}
        src={clip.url}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
      <button
        onClick={toggle}
        className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors shrink-0"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <Pause className="w-3.5 h-3.5" fill="currentColor" />
        ) : (
          <Play className="w-3.5 h-3.5" fill="currentColor" />
        )}
      </button>
    </>
  );
}

interface VoiceRecorderProps {
  isActive: boolean;
  isRecording: boolean;
  clips: AudioClip[];
  onStartRecording: () => void;
  onStopRecording: () => void;
  onRenameClip: (index: number, label: string) => void;
}

export function VoiceRecorder({
  isActive,
  isRecording,
  clips,
  onStartRecording,
  onStopRecording,
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
            <button
              onClick={onStartRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/60 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-card/90 transition-all text-sm"
            >
              <Mic className="w-4 h-4" />
              Record
            </button>
          ) : (
            <button
              onClick={onStopRecording}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-all text-sm"
            >
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" />
              </span>
              Recording...
            </button>
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
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card/40 border border-border/20">
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
      <span className="text-[11px] text-muted-foreground/40 tabular-nums shrink-0">
        {clip.durationSeconds}s
      </span>
      <ClipPlayer clip={clip} />
    </div>
  );
}
