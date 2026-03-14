import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import type { SessionType, Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { useTimer, type TimerInitialState } from "@/hooks/use-timer";
import { useVoiceRecorder, type AudioClip } from "@/hooks/use-voice-recorder";
import {
  loadSession,
  saveSession,
  clearSession,
  buildPersistedState,
  type RestoredSession,
} from "@/hooks/use-session-persistence";
import { XCircle } from "lucide-react";
import { motion } from "framer-motion";

import { TimerToggle } from "@/components/timer/TimerToggle";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { NotesArea } from "@/components/timer/NotesArea";
import { SessionList } from "@/components/timer/SessionList";
import { VoiceRecorder } from "@/components/timer/VoiceRecorder";
import { BottomNav, type Tab } from "@/components/nav/BottomNav";
import { CalendarView } from "@/components/calendar/CalendarView";

const BASE = import.meta.env.BASE_URL;

const TAB_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };

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

export default function HomeLoader() {
  const [restored, setRestored] = useState<RestoredSession | null | undefined>(undefined);

  useEffect(() => {
    loadSession().then((data) => setRestored(data));
  }, []);

  if (restored === undefined) return null;

  return <Home restored={restored} />;
}

function Home({ restored }: { restored: RestoredSession | null }) {
  const [activeTab, setActiveTab] = useState<Tab>("timer");
  const [notes, setNotes] = useState(restored?.notes ?? "");
  const [selectedTask, setSelectedTask] = useState<Task | null>(
    restored?.selectedTask
      ? ({
          id: restored.selectedTask.id,
          name: restored.selectedTask.name,
          projectId: restored.selectedTask.projectId,
          projectName: restored.selectedTask.projectName,
        } as Task)
      : null,
  );

  const timerInitialState: TimerInitialState | undefined = restored
    ? {
        mode: restored.timer.mode,
        phase: restored.timer.phase,
        isActive: restored.timer.isActive,
        startTimestamp: restored.timer.startTimestamp,
        elapsedAtPause: restored.timer.elapsedAtPause,
      }
    : undefined;

  const queryClient = useQueryClient();
  const recorder = useVoiceRecorder(restored?.clips);
  const pendingClipsRef = useRef<AudioClip[]>([]);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const createSession = useCreateSession({
    mutation: {
      onSuccess: async (session) => {
        const clipsToUpload = pendingClipsRef.current;
        pendingClipsRef.current = [];

        clearSession();

        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setNotes("");
        setSelectedTask(null);
        recorderRef.current.clearClips();

        if (clipsToUpload.length > 0) {
          try {
            await uploadClips(session.id, clipsToUpload);
            queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
          } catch (err) {
            console.error("Failed to upload recordings:", err);
          }
        }
      },
      onError: (err) => {
        console.error("Failed to create session:", err);
      },
    },
  });

  const handleLogSession = useCallback(
    async (type: SessionType, durationSeconds: number) => {
      const rec = recorderRef.current;
      const allClips = [...rec.clips];

      if (rec.isRecording) {
        const finalClipPromise = rec.stopRecording();
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
        },
      });
    },
    [createSession, notes, selectedTask],
  );

  const timer = useTimer({
    onLogSession: handleLogSession,
    initialState: timerInitialState,
  });

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      const hasActiveSession =
        timer.isActive ||
        timer.startTimestamp !== null ||
        timer.elapsedAtPause > 0 ||
        (timer.mode === "simple" && timer.seconds > 0) ||
        recorder.clips.length > 0 ||
        notes.trim().length > 0 ||
        selectedTask !== null;

      if (hasActiveSession) {
        const state = buildPersistedState(
          {
            mode: timer.mode,
            phase: timer.phase,
            isActive: timer.isActive,
            startTimestamp: timer.startTimestamp,
            elapsedAtPause: timer.elapsedAtPause,
          },
          notes,
          selectedTask
            ? {
                id: selectedTask.id,
                name: selectedTask.name,
                projectId: selectedTask.projectId ?? null,
                projectName: selectedTask.projectName ?? null,
              }
            : null,
          recorder.clips,
        );
        saveSession(state, recorder.clips);
      } else {
        clearSession();
      }
    }, 500);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [
    timer.mode,
    timer.phase,
    timer.isActive,
    timer.startTimestamp,
    timer.elapsedAtPause,
    notes,
    selectedTask,
    recorder.clips,
  ]);

  const handleStartRecording = useCallback(() => {
    const elapsed =
      timer.mode === "simple" ? timer.seconds : 25 * 60 - timer.seconds;
    recorder.startRecording(elapsed);
  }, [recorder, timer.mode, timer.seconds]);

  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [showAbortConfirm2, setShowAbortConfirm2] = useState(false);

  const handleAbort = useCallback(() => {
    timer.reset();
    if (recorderRef.current.isRecording) {
      recorderRef.current.discardAndStop();
    }
    recorderRef.current.clearClips();
    setNotes("");
    setSelectedTask(null);
    clearSession();
    setShowAbortConfirm(false);
    setShowAbortConfirm2(false);
  }, [timer]);

  const sessionIsInProgress =
    timer.isActive || timer.elapsedAtPause > 0 || (timer.mode === "simple" && timer.seconds > 0);

  useEffect(() => {
    if (!sessionIsInProgress) {
      setShowAbortConfirm(false);
      setShowAbortConfirm2(false);
    }
  }, [sessionIsInProgress]);

  const handleRestart = useCallback(
    (task: { id: number; name: string; projectId: number | null; projectName: string | null } | null, sessionNotes: string) => {
      if (task) {
        setSelectedTask({
          id: task.id,
          name: task.name,
          projectId: task.projectId,
          projectName: task.projectName,
        } as Task);
      } else {
        setSelectedTask(null);
      }
      setNotes(sessionNotes);

      timer.restartAs("simple");

      setActiveTab("timer");
    },
    [timer],
  );

  const glowColorClass = timer.mode === "simple"
    ? "bg-primary/20"
    : timer.phase === "focus"
      ? "bg-focus/20"
      : "bg-break/20";

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-background">
      <div className="flex-1 min-h-0 relative">
        {(["timer", "logs", "calendar"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <motion.div
              key={tab}
              animate={{
                opacity: isActive ? 1 : 0,
                y: isActive ? 0 : 8,
              }}
              transition={TAB_TRANSITION}
              className={
                tab === "calendar"
                  ? "absolute inset-0 overflow-hidden"
                  : "absolute inset-0 overflow-y-auto"
              }
              style={{ pointerEvents: isActive ? "auto" : "none" }}
              aria-hidden={!isActive}
              // @ts-expect-error inert is a valid HTML attribute
              inert={!isActive ? "" : undefined}
            >
              {tab === "timer" && (
                <main className="w-full py-8 px-4 sm:px-6 flex flex-col items-center pb-6">
                  <div className="w-full max-w-md space-y-8">
                    <header className="text-center space-y-6">
                      <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
                        Flow State
                      </h1>
                      <TimerToggle mode={timer.mode} onChange={timer.setMode} />
                    </header>

                    <section className="relative">
                      <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
                        <motion.div
                          className={`w-64 h-64 rounded-full blur-[100px] transition-colors duration-1000 ${glowColorClass}`}
                          animate={
                            timer.isActive
                              ? {
                                  scale: [1, 1.08, 1],
                                  opacity: [0.4, 0.55, 0.4],
                                }
                              : { scale: 1, opacity: 0.4 }
                          }
                          transition={
                            timer.isActive
                              ? {
                                  duration: 3.5,
                                  repeat: Infinity,
                                  ease: "easeInOut",
                                }
                              : { duration: 0.6 }
                          }
                        />
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

                      {sessionIsInProgress && (
                        <div className="flex justify-center mt-4">
                          {!showAbortConfirm ? (
                            <motion.button
                              onClick={() => setShowAbortConfirm(true)}
                              whileTap={{ scale: 0.96 }}
                              transition={{ duration: 0.12, ease: "easeOut" }}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Abort Session
                            </motion.button>
                          ) : showAbortConfirm2 ? (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/5 border border-destructive/20">
                              <span className="text-xs text-foreground/80">End session already? Progress won't be saved if you stop now.</span>
                              <motion.button
                                onClick={handleAbort}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                className="px-2.5 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-[11px] font-medium hover:bg-destructive transition-colors"
                              >
                                Yes, abort it
                              </motion.button>
                              <motion.button
                                onClick={() => { setShowAbortConfirm(false); setShowAbortConfirm2(false); }}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                className="px-2.5 py-1 rounded-md bg-secondary/60 text-foreground/70 text-[11px] font-medium hover:bg-secondary transition-colors"
                              >
                                Keep going
                              </motion.button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/5 border border-destructive/20">
                              <span className="text-xs text-foreground/80">Abort this session? This session will not be saved.</span>
                              <motion.button
                                onClick={() => setShowAbortConfirm2(true)}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                className="px-2.5 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-[11px] font-medium hover:bg-destructive transition-colors"
                              >
                                Abort
                              </motion.button>
                              <motion.button
                                onClick={() => setShowAbortConfirm(false)}
                                whileTap={{ scale: 0.96 }}
                                transition={{ duration: 0.12, ease: "easeOut" }}
                                className="px-2.5 py-1 rounded-md bg-secondary/60 text-foreground/70 text-[11px] font-medium hover:bg-secondary transition-colors"
                              >
                                Cancel
                              </motion.button>
                            </div>
                          )}
                        </div>
                      )}
                    </section>

                    <section className="space-y-4">
                      <VoiceRecorder
                        isActive={
                          timer.isActive &&
                          (timer.mode === "simple" || timer.phase === "focus")
                        }
                        isRecording={recorder.isRecording}
                        isPaused={recorder.isPaused}
                        clips={recorder.clips}
                        onStartRecording={handleStartRecording}
                        onStopRecording={recorder.stopRecording}
                        onPauseRecording={recorder.pauseRecording}
                        onResumeRecording={recorder.resumeRecording}
                        onRenameClip={recorder.renameClip}
                      />
                      <NotesArea
                        value={notes}
                        onChange={setNotes}
                        selectedTask={selectedTask}
                        onSelectTask={setSelectedTask}
                      />
                    </section>
                  </div>
                </main>
              )}
              {tab === "logs" && (
                <div className="w-full py-4 px-4 sm:px-6">
                  <div className="w-full max-w-2xl mx-auto pb-4">
                    <SessionList onRestart={handleRestart} />
                  </div>
                </div>
              )}
              {tab === "calendar" && <CalendarView />}
            </motion.div>
          );
        })}
      </div>

      <BottomNav
        activeTab={activeTab}
        onChange={setActiveTab}
        sessionIsInProgress={sessionIsInProgress}
      />
    </div>
  );
}
