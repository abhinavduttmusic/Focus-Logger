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
import { playBell } from "@/hooks/use-bell";
import { XCircle, LayoutList, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

import { TimerToggle } from "@/components/timer/TimerToggle";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { NotesArea } from "@/components/timer/NotesArea";
import { SessionList } from "@/components/timer/SessionList";
import { BottomNav, type Tab } from "@/components/nav/BottomNav";
import { CalendarView } from "@/components/calendar/CalendarView";
import { TasksTab } from "@/components/tasks/TasksTab";
import { StatsTab } from "@/components/stats/StatsTab";

const BASE = import.meta.env.BASE_URL;

const TAB_TRANSITION = { duration: 0.2, ease: [0.22, 1, 0.36, 1] as const };
const SHEET_TRANSITION = { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const };
const OVERLAY_VARIANTS = {
  hidden:  { opacity: 0, scale: 0.96, y: 6 },
  visible: { opacity: 1, scale: 1,    y: 0 },
  exit:    { opacity: 0, scale: 0.96, y: 6 },
};

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
        noteTitle: clip.noteTitle ?? null,
        noteNotes: clip.noteNotes ?? null,
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

  // True when a focus session auto-completed and break is now running.
  // Prevents clearing task/notes until after the break too.
  const breakWillAutoStartRef = useRef(false);

  // ─── Manual break tracking ────────────────────────────────────────────────
  // isManualBreakRef: mutable, used for synchronous checks in event handlers
  const isManualBreakRef    = useRef(false);
  const manualBreakLabelRef = useRef("");
  const pendingBreakLabelRef = useRef("Break"); // for interrupt-focus flow
  // manualBreakLabel: React state — drives the "On Break" pill render and acts
  // as a backup detection path (both must agree before a break is logged)
  const [manualBreakLabel, setManualBreakLabel] = useState("");

  const [showBreakSheet,            setShowBreakSheet]            = useState(false);
  const [showCustomBreakInput,      setShowCustomBreakInput]      = useState(false);
  const [breakCustomInput,          setBreakCustomInput]          = useState("");
  const [showBreakInterruptConfirm, setShowBreakInterruptConfirm] = useState(false);

  // ─── Session logging ─────────────────────────────────────────────────────

  const createSession = useCreateSession({
    mutation: {
      onSuccess: async (session) => {
        const clipsToUpload = pendingClipsRef.current;
        pendingClipsRef.current = [];

        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });

        const autoBreak = breakWillAutoStartRef.current;
        breakWillAutoStartRef.current = false;

        if (autoBreak) {
          // Focus completed naturally → break running. Keep notes/task visible.
          recorderRef.current.clearClips();
        } else {
          // Break done, simple done, or early stop → full reset.
          clearSession();
          setNotes("");
          setSelectedTask(null);
          recorderRef.current.clearClips();
        }

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

  // Keep a ref that always mirrors manualBreakLabel state so handleLogSession
  // (a stale-closure-safe callback) can read the latest value synchronously.
  const manualBreakLabelStateRef = useRef("");
  manualBreakLabelStateRef.current = manualBreakLabel;

  const handleLogSession = useCallback(
    async (type: SessionType, durationSeconds: number) => {
      // Manual break: detected via EITHER the mutation ref OR the state mirror.
      // Using both ensures we catch any timing edge-case.
      const isBreak = isManualBreakRef.current || manualBreakLabelStateRef.current !== "";
      if (isBreak) {
        const label = manualBreakLabelRef.current || manualBreakLabelStateRef.current || "Break";
        // Reset all break tracking immediately
        isManualBreakRef.current = false;
        manualBreakLabelRef.current = "";
        setManualBreakLabel("");
        pendingClipsRef.current = [];
        createSession.mutate({
          data: { type: "manual_break" as SessionType, durationSeconds, notes: label, taskId: null },
        });
        return;
      }
      if (type === "pomodoro_break") {
        pendingClipsRef.current = [];
        createSession.mutate({
          data: { type, durationSeconds, notes: "", taskId: null },
        });
      } else {
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
      }
    },
    [createSession, notes, selectedTask],
  );

  const timer = useTimer({
    onLogSession: handleLogSession,
    onAutoBreakStart: () => {
      breakWillAutoStartRef.current = true;
      playBell();
    },
    initialState: timerInitialState,
  });

  // ─── Derived state — kept early so refs stay fresh ───────────────────────

  const sessionIsInProgress =
    timer.isActive || timer.elapsedAtPause > 0 || (timer.mode === "simple" && timer.seconds > 0);

  const sessionIsInProgressRef = useRef(sessionIsInProgress);
  sessionIsInProgressRef.current = sessionIsInProgress;

  const canStart = timer.mode === "simple" || selectedTask !== null;

  // ─── Mode switching — locked while session is active ─────────────────────

  const modeDir = useRef<"left" | "right">("left");
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  // Floating overlay message — never causes layout shift
  const [modeLockMsg, setModeLockMsg] = useState(false);
  const modeLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showModeLockMessage = useCallback(() => {
    setModeLockMsg(true);
    if (modeLockTimer.current) clearTimeout(modeLockTimer.current);
    modeLockTimer.current = setTimeout(() => setModeLockMsg(false), 2000);
  }, []);

  const handleModeChange = useCallback((newMode: TimerMode) => {
    if (sessionIsInProgressRef.current) {
      showModeLockMessage();
      return;
    }
    if (newMode === timer.mode) return;
    modeDir.current = newMode === "simple" ? "left" : "right";
    timer.setMode(newMode);
  }, [timer, showModeLockMessage]);

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

  // ─── Task-required gate ───────────────────────────────────────────────────

  // Floating overlay message — never causes layout shift
  const [taskRequiredMsg, setTaskRequiredMsg] = useState(false);
  const taskRequiredTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTaskRequiredMessage = useCallback(() => {
    setTaskRequiredMsg(true);
    if (taskRequiredTimer.current) clearTimeout(taskRequiredTimer.current);
    taskRequiredTimer.current = setTimeout(() => setTaskRequiredMsg(false), 2000);
  }, []);

  // ─── Pomodoro commitment modal ────────────────────────────────────────────

  const [showCommitModal, setShowCommitModal] = useState(false);

  // Called when the Play button is tapped
  const handleStartRequest = useCallback(() => {
    if (timer.mode === "pomodoro") {
      // Show commitment confirmation before actually starting
      setShowCommitModal(true);
    } else {
      timer.start();
    }
  }, [timer]);

  const handleCommitConfirm = useCallback(() => {
    setShowCommitModal(false);
    timer.start();
  }, [timer]);

  // ─── "End session early?" (Pomodoro Stop) ────────────────────────────────

  const [showEndEarly, setShowEndEarly] = useState(false);
  const isFocusPhase = timer.mode === "pomodoro" && timer.phase === "focus";

  const handleEndEarlyConfirm = useCallback(() => {
    setShowEndEarly(false);
    timer.stop();
  }, [timer]);

  // ─── Manual break ────────────────────────────────────────────────────────

  const handleStartManualBreak = useCallback((label: string) => {
    setShowBreakSheet(false);
    setShowCustomBreakInput(false);
    setBreakCustomInput("");

    // Defensive guard: if focus session is running, ask first
    if (sessionIsInProgressRef.current) {
      pendingBreakLabelRef.current = label;
      setShowBreakInterruptConfirm(true);
      return;
    }

    // Set BOTH the ref (sync) and state (for rendering) before starting timer
    isManualBreakRef.current = true;
    manualBreakLabelRef.current = label;
    setManualBreakLabel(label);

    // Breaks run as a simple stopwatch
    if (timer.mode !== "simple") timer.setMode("simple");
    timer.start();
  }, [timer]);

  const handleBreakInterruptConfirm = useCallback(() => {
    setShowBreakInterruptConfirm(false);
    const label = pendingBreakLabelRef.current;

    // isManualBreakRef MUST be false here so timer.stop() logs the focus session correctly.
    // We set it to true only AFTER stop() has synchronously fired onLogSession.
    timer.stop(); // logs focus session (isManualBreakRef.current === false here)

    // Now mark the next session as a manual break and start the timer
    setTimeout(() => {
      isManualBreakRef.current = true;
      manualBreakLabelRef.current = label;
      setManualBreakLabel(label);
      if (timer.mode !== "simple") timer.setMode("simple");
      timer.start();
    }, 0);
  }, [timer]);

  // ─── Discard (Stopwatch only) ─────────────────────────────────────────────

  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const handleAbort = useCallback(() => {
    setShowDiscardConfirm(false);
    timer.reset();
    if (recorderRef.current.isRecording) {
      recorderRef.current.discardAndStop();
    }
    recorderRef.current.clearClips();
    setNotes("");
    setSelectedTask(null);
    clearSession();
  }, [timer]);

  // ─── Activity view switcher ───────────────────────────────────────────────

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

  // ─── Recording offset ─────────────────────────────────────────────────────

  const handleStartRecording = useCallback(() => {
    const elapsed =
      timer.mode === "simple" ? timer.seconds : 25 * 60 - timer.seconds;
    recorder.startRecording(elapsed);
  }, [recorder, timer.mode, timer.seconds]);

  // ─── Session persistence ──────────────────────────────────────────────────

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

  // ─── Glow ─────────────────────────────────────────────────────────────────

  const glowColorClass = timer.mode === "simple"
    ? "bg-primary/20"
    : timer.phase === "focus"
      ? "bg-focus/20"
      : "bg-break/20";

  // ─── Render ───────────────────────────────────────────────────────────────

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
                  ? "absolute inset-0 overflow-hidden"
                  : "absolute inset-0 overflow-hidden"
              }
              style={{ pointerEvents: isActive ? "auto" : "none" }}
              aria-hidden={!isActive}
              // @ts-expect-error inert is a valid HTML attribute
              inert={!isActive ? "" : undefined}
            >
              {tab === "timer" && (
                <main className="h-full w-full px-4 sm:px-6 flex flex-col items-center">
                  <div className="w-full max-w-md h-full flex flex-col">

                    {/* ── TIMER SECTION: fixed 45vh, relative so overlays anchor here ── */}
                    <div
                      className="relative w-full flex flex-col justify-evenly items-center shrink-0"
                      style={{ height: "45vh" }}
                    >
                      {/* Ambient glow */}
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

                      {/* Mode toggle — never shifts layout */}
                      <div className="text-center">
                        <TimerToggle
                          mode={timer.mode}
                          onChange={handleModeChange}
                          locked={sessionIsInProgress}
                          onLockedTap={showModeLockMessage}
                        />
                      </div>

                      {/* Digits + controls (swipe zone) */}
                      <div
                        onPointerDown={handleSwipeStart}
                        onPointerUp={handleSwipeEnd}
                        onPointerCancel={() => { swipeStart.current = null; }}
                        style={{
                          touchAction: "pan-y",
                          WebkitTapHighlightColor: "transparent",
                          outline: "none",
                        }}
                        className="select-none w-full"
                      >
                        {/* "On Break" label pill — shown only during a manual break */}
                        <AnimatePresence>
                          {manualBreakLabel && sessionIsInProgress && (
                            <motion.div
                              key="break-pill"
                              initial={{ opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="flex justify-center mb-3"
                            >
                              <span
                                className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium tracking-tight"
                                style={{
                                  background:
                                    /coffee|tea/i.test(manualBreakLabel) ? "#F5EFE6"
                                    : /lunch/i.test(manualBreakLabel) ? "#FFF4E5"
                                    : /walk/i.test(manualBreakLabel) ? "#EAF0FF"
                                    : /rest/i.test(manualBreakLabel) ? "#F3E8FF"
                                    : /music/i.test(manualBreakLabel) ? "#FFF0F8"
                                    : "#E8F3EC",
                                  color: "rgba(0,0,0,0.50)",
                                }}
                              >
                                On Break&nbsp;·&nbsp;{manualBreakLabel}
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <TimerDisplay
                          mode={timer.mode}
                          phase={timer.phase}
                          seconds={timer.seconds}
                          isActive={timer.isActive}
                          canStart={canStart}
                          onStartBlocked={showTaskRequiredMessage}
                          onInterruptRequest={() => setShowEndEarly(true)}
                          onStart={handleStartRequest}
                          onPause={timer.pause}
                          onStop={timer.stop}
                          modeDir={modeDir}
                        />
                      </div>

                      {/* ── Floating overlays — absolute, zero layout impact ── */}
                      <div
                        aria-live="polite"
                        className="absolute bottom-2 left-0 right-0 flex flex-col items-center gap-2 pointer-events-none z-20"
                      >
                        <AnimatePresence>
                          {taskRequiredMsg && (
                            <motion.span
                              key="task-req"
                              variants={OVERLAY_VARIANTS}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="text-xs font-medium text-foreground/75 bg-card/90 backdrop-blur-sm border border-border/30 shadow-md px-4 py-2 rounded-full"
                            >
                              Select a task to begin
                            </motion.span>
                          )}
                        </AnimatePresence>

                        <AnimatePresence>
                          {modeLockMsg && (
                            <motion.span
                              key="mode-lock"
                              variants={OVERLAY_VARIANTS}
                              initial="hidden"
                              animate="visible"
                              exit="exit"
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="text-xs font-medium text-foreground/75 bg-card/90 backdrop-blur-sm border border-border/30 shadow-md px-4 py-2 rounded-full"
                            >
                              Finish your session before switching modes
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* ── Session controls — Stopwatch only ── */}
                    <AnimatePresence>
                      {sessionIsInProgress && timer.mode === "simple" && !isManualBreakRef.current && (
                        <motion.div
                          key="session-controls"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="flex flex-col items-center gap-3"
                        >
                          <motion.button
                            onClick={() => setShowDiscardConfirm(true)}
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Discard Session
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* ── Start Break CTA — idle + no task selected ── */}
                    <AnimatePresence>
                      {!sessionIsInProgress && !selectedTask && (
                        <motion.div
                          key="start-break-cta"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                          className="flex justify-center"
                        >
                          <motion.button
                            onClick={() => setShowBreakSheet(true)}
                            whileTap={{ scale: 0.96 }}
                            transition={{ duration: 0.1, ease: "easeOut" }}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-medium text-muted-foreground/60 bg-secondary/40 hover:bg-secondary/60 border border-border/30 transition-colors"
                          >
                            <span>☕</span>
                            Take a Break
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="h-8 shrink-0" />

                    {/* Notes / Task section — takes all remaining space, stays bounded */}
                    <section className="flex-1 min-h-0 pb-5 overflow-hidden">
                      <NotesArea
                        value={notes}
                        onChange={setNotes}
                        selectedTask={selectedTask}
                        onSelectTask={setSelectedTask}
                        isSessionActive={sessionIsInProgress}
                        isRecording={recorder.isRecording}
                        isPaused={recorder.isPaused}
                        clips={recorder.clips}
                        onStartRecording={handleStartRecording}
                        onStopRecording={recorder.stopRecording}
                        onPauseRecording={recorder.pauseRecording}
                        onResumeRecording={recorder.resumeRecording}
                        onRenameClip={recorder.renameClip}
                        onUpdateClip={recorder.updateClip}
                        onDeleteClip={recorder.deleteClip}
                        onCancelRecording={recorder.discardAndStop}
                      />
                    </section>

                  </div>
                </main>
              )}

              {tab === "tasks" && <TasksTab isActive={activeTab === "tasks"} />}
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
                { view: "logs"     as const, Icon: LayoutList, label: "List view" },
                { view: "calendar" as const, Icon: Calendar,   label: "Calendar view" },
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

      {/* ═══════════════════════════════════════════════════════
          BOTTOM SHEETS & MODALS — rendered at root z-level
          ═══════════════════════════════════════════════════════ */}

      {/* 1. Pomodoro Commitment modal ("Start focus session?") */}
      <AnimatePresence>
        {showCommitModal && (
          <>
            <motion.div
              key="commit-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowCommitModal(false)}
            />
            <motion.div
              key="commit-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={SHEET_TRANSITION}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-10 shadow-xl"
            >
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-6" />
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                Start focus session?
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                This session cannot be paused once started.
              </p>
              <div className="flex flex-col gap-3">
                <motion.button
                  onClick={handleCommitConfirm}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  Start Session
                </motion.button>
                <motion.button
                  onClick={() => setShowCommitModal(false)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-secondary/50 text-foreground/70 font-medium text-sm hover:bg-secondary/70 transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 2. "End session early?" (Pomodoro Stop) */}
      <AnimatePresence>
        {showEndEarly && (
          <>
            <motion.div
              key="end-early-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowEndEarly(false)}
            />
            <motion.div
              key="end-early-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={SHEET_TRANSITION}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-10 shadow-xl"
            >
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-6" />
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                End session early?
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                {isFocusPhase
                  ? "This will end your focus session."
                  : "This will end your break early."}
              </p>
              <div className="flex flex-col gap-3">
                <motion.button
                  onClick={handleEndEarlyConfirm}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/15 transition-colors"
                >
                  End Session
                </motion.button>
                <motion.button
                  onClick={() => setShowEndEarly(false)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-secondary/50 text-foreground/70 font-medium text-sm hover:bg-secondary/70 transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 3. Discard Session (Stopwatch only) */}
      <AnimatePresence>
        {showDiscardConfirm && (
          <>
            <motion.div
              key="discard-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowDiscardConfirm(false)}
            />
            <motion.div
              key="discard-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={SHEET_TRANSITION}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-10 shadow-xl"
            >
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-6" />
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                Discard this session?
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                Your current timer progress will be lost.
              </p>
              <div className="flex flex-col gap-3">
                <motion.button
                  onClick={handleAbort}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-destructive/10 text-destructive font-semibold text-sm hover:bg-destructive/15 transition-colors"
                >
                  Discard Session
                </motion.button>
                <motion.button
                  onClick={() => setShowDiscardConfirm(false)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-secondary/50 text-foreground/70 font-medium text-sm hover:bg-secondary/70 transition-colors"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 4. Break picker bottom sheet */}
      <AnimatePresence>
        {showBreakSheet && (
          <>
            <motion.div
              key="break-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => {
                // Dismiss only — do NOT start any break
                setShowBreakSheet(false);
                setShowCustomBreakInput(false);
                setBreakCustomInput("");
              }}
            />
            <motion.div
              key="break-sheet"
              initial={{ y: "100%", opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={SHEET_TRANSITION}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-10 shadow-xl"
            >
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-5" />
              <h2 className="text-base font-semibold text-foreground text-center mb-5">
                Take a break
              </h2>

              {/* Break option grid */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { emoji: "☕", label: "Tea / Coffee", bg: "#F5EFE6" },
                  { emoji: "🥪", label: "Lunch",        bg: "#FFF4E5" },
                  { emoji: "🚶", label: "Walk",         bg: "#EAF0FF" },
                  { emoji: "🧘", label: "Rest",         bg: "#F3E8FF" },
                  { emoji: "🎧", label: "Music",        bg: "#FFF0F8" },
                  { emoji: "✏️", label: "+ Custom",     bg: "#F2F2F7", isCustom: true },
                ].map(({ emoji, label, bg, isCustom }) => (
                  <motion.button
                    key={label}
                    onClick={() => {
                      if (isCustom) {
                        setShowCustomBreakInput(true);
                      } else {
                        handleStartManualBreak(`${label} ${emoji}`);
                      }
                    }}
                    whileTap={{ scale: 0.94 }}
                    transition={{ duration: 0.1, ease: "easeOut" }}
                    className="flex flex-col items-center justify-center gap-1.5 py-4 px-2 rounded-2xl text-center transition-opacity active:opacity-80"
                    style={{ background: bg }}
                  >
                    <span className="text-2xl leading-none">{emoji}</span>
                    <span className="text-[11px] font-medium text-foreground/70 leading-tight">{label}</span>
                  </motion.button>
                ))}
              </div>

              {/* Custom label input — inline within sheet */}
              <AnimatePresence>
                {showCustomBreakInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    {/* px-px + pb-2 give the focus ring room — parent overflow-hidden would clip it otherwise */}
                    <div className="flex gap-2 mt-1 px-px pb-2">
                      <input
                        autoFocus
                        type="text"
                        placeholder="What are you doing?"
                        value={breakCustomInput}
                        onChange={(e) => setBreakCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleStartManualBreak(breakCustomInput.trim() || "Break");
                          }
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <motion.button
                        onClick={() => handleStartManualBreak(breakCustomInput.trim() || "Break")}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
                      >
                        Go
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 5. Break interrupt confirmation ("End focus → start break?") */}
      <AnimatePresence>
        {showBreakInterruptConfirm && (
          <>
            <motion.div
              key="break-interrupt-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setShowBreakInterruptConfirm(false)}
            />
            <motion.div
              key="break-interrupt-sheet"
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={SHEET_TRANSITION}
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-10 shadow-xl"
            >
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-6" />
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                End focus session?
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-8">
                Your current session will be logged and a break will start.
              </p>
              <div className="flex flex-col gap-3">
                <motion.button
                  onClick={handleBreakInterruptConfirm}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-primary/10 text-primary font-semibold text-sm hover:bg-primary/15 transition-colors"
                >
                  End Session & Start Break
                </motion.button>
                <motion.button
                  onClick={() => setShowBreakInterruptConfirm(false)}
                  whileTap={{ scale: 0.97 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  className="w-full py-3.5 rounded-2xl bg-secondary/50 text-foreground/70 font-medium text-sm hover:bg-secondary/70 transition-colors"
                >
                  Keep Focusing
                </motion.button>
              </div>
            </motion.div>
          </>
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
