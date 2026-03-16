import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import type { SessionType, Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { useTimer, type TimerMode, type TimerInitialState } from "@/hooks/use-timer";
import {
  loadSession,
  saveSession,
  clearSession,
  buildPersistedState,
  type RestoredSession,
} from "@/hooks/use-session-persistence";
import { useVoiceRecorder, type AudioClip } from "@/hooks/use-voice-recorder";
import { XCircle, LayoutList, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { TimerToggle } from "@/components/timer/TimerToggle";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { NotesArea } from "@/components/timer/NotesArea";
import { SessionList } from "@/components/timer/SessionList";
import { VoiceRecorder } from "@/components/timer/VoiceRecorder";
import { BottomNav, type Tab } from "@/components/nav/BottomNav";
import { CalendarView } from "@/components/calendar/CalendarView";
import { TasksTab } from "@/components/tasks/TasksTab";
import { StatsTab } from "@/components/stats/StatsTab";

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
  const [activityView, setActivityView] = useState<"logs" | "calendar">("logs");
  const [showViewSwitcher, setShowViewSwitcher] = useState(true);
  const switcherRef = useRef<HTMLDivElement>(null);
  const suppressDismissRef = useRef(false);

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
        const finalClip = await rec.stopRecording();
        if (finalClip) allClips.push(finalClip);
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

  // Swipe-to-switch-mode gesture
  const modeDir = useRef<"left" | "right">("left");
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  const handleModeChange = useCallback((newMode: TimerMode) => {
    if (newMode === timer.mode) return;
    modeDir.current = newMode === "simple" ? "left" : "right";
    timer.setMode(newMode);
  }, [timer]);

  const handleSwipeStart = useCallback((e: React.PointerEvent) => {
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleSwipeEnd = useCallback((e: React.PointerEvent) => {
    if (!swipeStart.current) return;
    const dx = e.clientX - swipeStart.current.x;
    const dy = e.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < 40) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    handleModeChange(dx < 0 ? "simple" : "pomodoro");
  }, [handleModeChange]);

  // Dismiss activity view switcher when tapping outside
  useEffect(() => {
    if (!showViewSwitcher || activeTab !== "activity") return;
    function handleDocClick(e: MouseEvent) {
      if (suppressDismissRef.current) {
        suppressDismissRef.current = false;
        return;
      }
      if (switcherRef.current?.contains(e.target as Node)) return;
      setShowViewSwitcher(false);
    }
    document.addEventListener("click", handleDocClick);
    return () => document.removeEventListener("click", handleDocClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showViewSwitcher, activeTab]);

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === activeTab && tab === "activity") {
      suppressDismissRef.current = true;
      setShowViewSwitcher(prev => !prev);
    } else {
      setActiveTab(tab);
      if (tab === "activity") setShowViewSwitcher(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleStartRecording = useCallback(() => {
    const elapsed =
      timer.mode === "simple" ? timer.seconds : 25 * 60 - timer.seconds;
    recorder.startRecording(elapsed);
  }, [recorder, timer.mode, timer.seconds]);

  const handleAbort = useCallback(() => {
    timer.reset();
    if (recorderRef.current.isRecording) {
      recorderRef.current.discardAndStop();
    }
    recorderRef.current.clearClips();
    setNotes("");
    setSelectedTask(null);
    clearSession();
  }, [timer]);

  const sessionIsInProgress =
    timer.isActive || timer.elapsedAtPause > 0 || (timer.mode === "simple" && timer.seconds > 0);

  // Session persistence — debounced save
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
        {(["timer", "activity", "tasks", "stats"] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <motion.div
              key={tab}
              animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 8 }}
              transition={TAB_TRANSITION}
              className={
                tab === "timer"
                  ? "absolute inset-0 overflow-y-auto"
                  : "absolute inset-0 overflow-hidden"
              }
              style={{ pointerEvents: isActive ? "auto" : "none" }}
              aria-hidden={!isActive}
              // @ts-expect-error inert is a valid HTML attribute
              inert={!isActive ? "" : undefined}
            >
              {tab === "timer" && (
                <main className="w-full pt-6 pb-6 px-4 sm:px-6 flex flex-col items-center">
                  <div className="w-full max-w-md space-y-4">

                    {/* Mode toggle */}
                    <div className="text-center">
                      <TimerToggle mode={timer.mode} onChange={handleModeChange} />
                    </div>

                    {/* Timer digits + controls */}
                    <section className="relative">
                      <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
                        <motion.div
                          className={`w-64 h-64 rounded-full blur-[100px] transition-colors duration-1000 ${glowColorClass}`}
                          animate={
                            timer.isActive
                              ? { scale: [1, 1.08, 1], opacity: [0.4, 0.55, 0.4] }
                              : { scale: 1, opacity: 0.4 }
                          }
                          transition={
                            timer.isActive
                              ? { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
                              : { duration: 0.6 }
                          }
                        />
                      </div>

                      <div
                        onPointerDown={handleSwipeStart}
                        onPointerUp={handleSwipeEnd}
                        onPointerCancel={() => { swipeStart.current = null; }}
                        style={{
                          touchAction: "pan-y",
                          WebkitTapHighlightColor: "transparent",
                          outline: "none",
                        }}
                        className="select-none"
                      >
                        <TimerDisplay
                          mode={timer.mode}
                          phase={timer.phase}
                          seconds={timer.seconds}
                          isActive={timer.isActive}
                          onStart={timer.start}
                          onPause={timer.pause}
                          onStop={timer.stop}
                          modeDir={modeDir}
                        />
                      </div>
                    </section>

                    {/* Abort + Record — only while a session is in progress */}
                    <AnimatePresence>
                      {sessionIsInProgress && (
                        <motion.section
                          key="session-controls"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="flex flex-col items-center gap-3"
                        >
                          <motion.button
                            onClick={handleAbort}
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Abort Session
                          </motion.button>

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
                            onCancelRecording={recorder.discardAndStop}
                          />
                        </motion.section>
                      )}
                    </AnimatePresence>

                    {/* Session Notes & Goals */}
                    <section>
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

              {tab === "tasks" && (
                <TasksTab isActive={activeTab === "tasks"} />
              )}

              {tab === "stats" && <StatsTab />}

              {tab === "activity" && (
                <div className="absolute inset-0">
                  <motion.div
                    animate={{ opacity: activityView === "logs" ? 1 : 0, x: activityView === "logs" ? 0 : -24 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 overflow-y-auto"
                    style={{ pointerEvents: activeTab === "activity" && activityView === "logs" ? "auto" : "none" }}
                    aria-hidden={activityView !== "logs"}
                    // @ts-expect-error inert is valid HTML
                    inert={activityView !== "logs" ? "" : undefined}
                  >
                    <div className="w-full pt-4 pb-8 px-4 sm:px-6">
                      <div className="w-full max-w-2xl mx-auto">
                        <SessionList onRestart={handleRestart} />
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    animate={{ opacity: activityView === "calendar" ? 1 : 0, x: activityView === "calendar" ? 0 : 24 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 overflow-hidden"
                    style={{ pointerEvents: activeTab === "activity" && activityView === "calendar" ? "auto" : "none" }}
                    aria-hidden={activityView !== "calendar"}
                    // @ts-expect-error inert is valid HTML
                    inert={activityView !== "calendar" ? "" : undefined}
                  >
                    <CalendarView isActive={activeTab === "activity" && activityView === "calendar"} />
                  </motion.div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Activity view switcher */}
      <AnimatePresence>
        {activeTab === "activity" && showViewSwitcher && (
          <motion.div
            key="view-switcher"
            ref={switcherRef}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="flex justify-center items-center py-1.5"
          >
            <div className="flex items-center gap-0.5 p-1 rounded-full bg-secondary/50 border border-border/30">
              {([
                { view: "logs" as const, Icon: LayoutList, label: "List view" },
                { view: "calendar" as const, Icon: Calendar, label: "Calendar view" },
              ]).map(({ view, Icon, label }) => (
                <motion.button
                  key={view}
                  whileTap={{ scale: 0.91 }}
                  transition={{ duration: 0.1, ease: [0.22, 1, 0.36, 1] }}
                  onClick={() => setActivityView(view)}
                  aria-label={label}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors duration-150",
                    activityView === view
                      ? "bg-foreground/10 text-foreground/85"
                      : "text-muted-foreground/40 hover:text-muted-foreground/60"
                  )}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav
        activeTab={activeTab}
        onChange={handleTabChange}
        sessionIsInProgress={sessionIsInProgress}
      />
    </div>
  );
}
