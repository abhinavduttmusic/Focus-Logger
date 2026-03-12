import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AudioClip } from "@/hooks/use-voice-recorder";

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface VoiceRecorderProps {
  isActive: boolean;
  isRecording: boolean;
  clips: AudioClip[];
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function VoiceRecorder({
  isActive,
  isRecording,
  clips,
  onStartRecording,
  onStopRecording,
}: VoiceRecorderProps) {
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
            <div
              key={i}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-card/40 border border-border/20"
            >
              <Mic className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
              <span className="text-xs text-muted-foreground/60 tabular-nums shrink-0">
                @{formatOffset(clip.offsetSeconds)}
              </span>
              <audio
                src={clip.url}
                controls
                className={cn(
                  "h-8 flex-1 min-w-0",
                  "[&::-webkit-media-controls-panel]:bg-transparent"
                )}
              />
              <span className="text-xs text-muted-foreground/50 tabular-nums shrink-0">
                {clip.durationSeconds}s
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
