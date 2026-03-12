import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import type { SessionType, Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { useTimer } from "@/hooks/use-timer";
import { useVoiceRecorder, type AudioClip } from "@/hooks/use-voice-recorder";

import { TimerToggle } from "@/components/timer/TimerToggle";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { NotesArea } from "@/components/timer/NotesArea";
import { SessionList } from "@/components/timer/SessionList";
import { VoiceRecorder } from "@/components/timer/VoiceRecorder";

const BASE = import.meta.env.BASE_URL;

async function uploadClips(sessionId: number, clips: AudioClip[]) {
  for (const clip of clips) {
    const urlRes = await fetch(`${BASE}api/storage/uploads/request-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `recording-${Date.now()}.webm`,
        size: clip.blob.size,
        contentType: clip.blob.type || "audio/webm",
      }),
    });
    const { uploadURL, objectPath } = await urlRes.json();

    await fetch(uploadURL, {
      method: "PUT",
      headers: { "Content-Type": clip.blob.type || "audio/webm" },
      body: clip.blob,
    });

    await fetch(`${BASE}api/recordings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        objectPath,
        label: clip.label || null,
        durationSeconds: clip.durationSeconds,
        offsetSeconds: clip.offsetSeconds,
      }),
    });
  }
}

export default function Home() {
  const [notes, setNotes] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();
  const recorder = useVoiceRecorder();
  const pendingClipsRef = useRef<AudioClip[]>([]);

  const createSession = useCreateSession({
    mutation: {
      onSuccess: async (session) => {
        const clipsToUpload = pendingClipsRef.current;
        pendingClipsRef.current = [];

        if (clipsToUpload.length > 0) {
          try {
            await uploadClips(session.id, clipsToUpload);
          } catch (err) {
            console.error("Failed to upload recordings:", err);
          }
        }

        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setNotes("");
        recorder.clearClips();
      }
    }
  });

  const handleLogSession = useCallback(async (type: SessionType, durationSeconds: number) => {
    const allClips = [...recorder.clips];

    if (recorder.isRecording) {
      const finalClipPromise = recorder.stopRecording();
      if (finalClipPromise) {
        const finalClip = await finalClipPromise;
        allClips.push(finalClip);
      }
    }

    pendingClipsRef.current = allClips;
    createSession.mutate({
      data: {
        type,
        durationSeconds,
        notes: notes.trim(),
        taskId: selectedTask?.id ?? null,
      }
    });
  }, [recorder, createSession, notes, selectedTask]);

  const timer = useTimer({
    onLogSession: handleLogSession
  });

  const handleStartRecording = useCallback(() => {
    const elapsed = timer.mode === "simple"
      ? timer.seconds
      : (25 * 60) - timer.seconds;
    recorder.startRecording(elapsed);
  }, [recorder, timer.mode, timer.seconds]);

  return (
    <main className="min-h-screen w-full py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-12">
        
        <header className="text-center space-y-8">
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            Flow State
          </h1>
          <TimerToggle mode={timer.mode} onChange={timer.setMode} />
        </header>

        <section className="relative">
          <div className="absolute inset-0 -z-10 flex items-center justify-center opacity-40 blur-[100px] pointer-events-none">
            <div className={`w-64 h-64 rounded-full transition-colors duration-1000 ${
               timer.mode === 'simple' ? 'bg-primary/20' : 
               timer.phase === 'focus' ? 'bg-focus/20' : 'bg-break/20'
            }`} />
          </div>

          <TimerDisplay 
            mode={timer.mode}
            phase={timer.phase}
            seconds={timer.seconds}
            isActive={timer.isActive}
            onStart={timer.start}
            onPause={timer.pause}
            onStop={timer.stop}
          />
        </section>

        <section className="space-y-4">
          <VoiceRecorder
            isActive={timer.isActive && (timer.mode === "simple" || timer.phase === "focus")}
            isRecording={recorder.isRecording}
            clips={recorder.clips}
            onStartRecording={handleStartRecording}
            onStopRecording={recorder.stopRecording}
            onRenameClip={recorder.renameClip}
          />
          <NotesArea 
            value={notes} 
            onChange={setNotes} 
            selectedTask={selectedTask}
            onSelectTask={setSelectedTask}
          />
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-border/60 to-transparent my-16" />

        <section className="pb-24">
          <SessionList onRestart={(task, notes) => {
            if (task) {
              setSelectedTask({ id: task.id, name: task.name, projectId: task.projectId, projectName: task.projectName } as Task);
            } else {
              setSelectedTask(null);
            }
            setNotes(notes);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }} />
        </section>

      </div>
    </main>
  );
}
