import { useState, useRef, useCallback } from "react";

export type AudioClip = {
  blob: Blob;
  durationSeconds: number;
  offsetSeconds: number;
  url: string;
};

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const offsetRef = useRef(0);

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
      offsetRef.current = sessionOffsetSeconds;
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const durationSeconds = Math.round((Date.now() - startTimeRef.current) / 1000);
        const url = URL.createObjectURL(blob);

        setClips((prev) => [
          ...prev,
          {
            blob,
            durationSeconds: Math.max(durationSeconds, 1),
            offsetSeconds: offsetRef.current,
            url,
          },
        ]);

        stream.getTracks().forEach((track) => track.stop());
        chunksRef.current = [];
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  const clearClips = useCallback(() => {
    setClips((prev) => {
      prev.forEach((clip) => URL.revokeObjectURL(clip.url));
      return [];
    });
  }, []);

  return {
    isRecording,
    clips,
    startRecording,
    stopRecording,
    clearClips,
  };
}
