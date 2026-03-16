import { useState, useRef, useCallback } from "react";

export type AudioClip = {
  blob: Blob;
  durationSeconds: number;
  offsetSeconds: number;
  label: string;
  url: string;
  noteTitle?: string;
  noteNotes?: string;
};

export function useVoiceRecorder(initialClips?: AudioClip[]) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [clips, setClips] = useState<AudioClip[]>(initialClips ?? []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const pausedDurationRef = useRef(0);
  const pauseStartRef = useRef(0);
  const offsetRef = useRef(0);
  const stopResolveRef = useRef<((clip: AudioClip) => void) | null>(null);
  const discardNextRef = useRef(false);

  const startRecording = useCallback(async (sessionOffsetSeconds: number) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      startTimeRef.current = Date.now();
      pausedDurationRef.current = 0;
      pauseStartRef.current = 0;
      offsetRef.current = sessionOffsetSeconds;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const totalElapsed = Date.now() - startTimeRef.current;
        const activeDuration = totalElapsed - pausedDurationRef.current;
        const durationSeconds = Math.round(activeDuration / 1000);

        stream.getTracks().forEach((track) => track.stop());
        chunksRef.current = [];

        if (discardNextRef.current) {
          discardNextRef.current = false;
          if (stopResolveRef.current) {
            stopResolveRef.current = null;
          }
          return;
        }

        const url = URL.createObjectURL(blob);

        const clip: AudioClip = {
          blob,
          durationSeconds: Math.max(durationSeconds, 1),
          offsetSeconds: offsetRef.current,
          label: "",
          url,
        };

        setClips((prev) => {
          const defaultLabel = `Recording ${prev.length + 1}`;
          clip.label = defaultLabel;
          return [...prev, clip];
        });

        if (stopResolveRef.current) {
          stopResolveRef.current(clip);
          stopResolveRef.current = null;
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, []);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      pauseStartRef.current = Date.now();
      setIsPaused(true);
    }
  }, []);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      pausedDurationRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = 0;
      mediaRecorderRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const stopRecording = useCallback((): Promise<AudioClip> | null => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      if (isPaused && pauseStartRef.current > 0) {
        pausedDurationRef.current += Date.now() - pauseStartRef.current;
        pauseStartRef.current = 0;
      }
      const promise = new Promise<AudioClip>((resolve) => {
        stopResolveRef.current = resolve;
      });
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      return promise;
    }
    return null;
  }, [isPaused]);

  const renameClip = useCallback((index: number, label: string) => {
    setClips((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], label };
      }
      return next;
    });
  }, []);

  const updateClip = useCallback((index: number, updates: Partial<AudioClip>) => {
    setClips((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], ...updates };
      }
      return next;
    });
  }, []);

  const deleteClip = useCallback((index: number) => {
    setClips((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1);
      removed.forEach((c) => URL.revokeObjectURL(c.url));
      return next;
    });
  }, []);

  const clearClips = useCallback(() => {
    setClips((prev) => {
      prev.forEach((clip) => URL.revokeObjectURL(clip.url));
      return [];
    });
  }, []);

  const discardAndStop = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      discardNextRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  }, []);

  const replaceClips = useCallback((newClips: AudioClip[]) => {
    setClips(newClips);
  }, []);

  return {
    isRecording,
    isPaused,
    clips,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    renameClip,
    updateClip,
    deleteClip,
    clearClips,
    replaceClips,
    discardAndStop,
  };
}
