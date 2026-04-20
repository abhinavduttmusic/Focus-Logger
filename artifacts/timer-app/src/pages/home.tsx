import { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import type { Session, SessionType, Task } from "@workspace/api-client-react/src/generated/api.schemas";
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
import { XCircle, LayoutList, Calendar, Sparkles, X } from "lucide-react";
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
const NOTES_DEFAULT_HEIGHT = Math.round(window.innerHeight * 0.35);
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

const CUSTOM_BREAK_COLORS = [
  "#E8F0FE", // light blue
  "#FDE8E8", // light red
  "#E6F4EA", // light green
  "#FFF4E5", // light orange
  "#F3E8FF", // light purple
  "#E0F7FA", // cyan
  "#FCE7F3", // pink
];

const DEFAULT_BREAK_TYPES: { id: string; label: string; emoji: string; bg: string }[] = [
  { id: "tea",     label: "Tea / Coffee", emoji: "☕", bg: "#F5EFE6" },
  { id: "lunch",   label: "Lunch",        emoji: "🥪", bg: "#FFF4E5" },
  { id: "walk",    label: "Walk",         emoji: "🚶", bg: "#EAF0FF" },
  { id: "rest",    label: "Rest",         emoji: "🧘", bg: "#F3E8FF" },
  { id: "music",   label: "Music",        emoji: "🎧", bg: "#FFF0F8" },
  { id: "youtube", label: "YouTube",      emoji: "▶️", bg: "#FFF0EE" },
  { id: "tv",      label: "TV",           emoji: "📺", bg: "#EEEEF5" },
];

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
  /** Unified break type list — persisted in localStorage under "breakTypes" */
  const [breakTypes, setBreakTypes] = useState<{ id: string; label: string; emoji: string; bg: string }[]>(() => {
    try {
      const stored = localStorage.getItem("breakTypes");
      if (stored) return JSON.parse(stored);
      localStorage.setItem("breakTypes", JSON.stringify(DEFAULT_BREAK_TYPES));
      return DEFAULT_BREAK_TYPES;
    } catch { return DEFAULT_BREAK_TYPES; }
  });
  /** id of the tile currently in "long-press edit" state (null = none) */
  const [activeBreakEditId,    setActiveBreakEditId]    = useState<string | null>(null);
  const [pendingDeleteBreakId, setPendingDeleteBreakId] = useState<string | null>(null);
  const [breakGridScrolling,   setBreakGridScrolling]   = useState(false);
  const breakLongPressRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breakDidLongPressRef   = useRef(false);
  const breakScrollTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Notes card bottom-sheet drag ────────────────────────────────────────
  const [notesCardHeight,  setNotesCardHeight]  = useState(NOTES_DEFAULT_HEIGHT);
  const [notesAnimating,   setNotesAnimating]   = useState(false);
  const notesDraggingRef       = useRef(false);
  const notesDragStartYRef     = useRef(0);
  const notesDragStartHeightRef = useRef(0);
  const isNotesExpanded = notesCardHeight > Math.round(window.innerHeight * 0.35) + 10;

  // ─── Daily Debrief (AI summary) ──────────────────────────────────────────
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryText, setSummaryText]           = useState("");
  const [summaryLoading, setSummaryLoading]     = useState(false);
  const [summaryError, setSummaryError]         = useState<string | null>(null);
  const [summaryDateKey, setSummaryDateKey]     = useState<string | null>(null);
  const [summaryIsCached, setSummaryIsCached]   = useState(false);
  const [summaryHistoryDate, setSummaryHistoryDate] = useState<string | null>(null);

  const generateDebrief = useCallback(async (regenerate: boolean, targetDateKey?: string) => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText("");

    try {
      const target = targetDateKey ? new Date(targetDateKey + "T00:00:00") : new Date();
      const dateKey =
        targetDateKey ||
        `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
      setSummaryDateKey(dateKey);

      const sessionsData =
        (queryClient.getQueryData(getListSessionsQueryKey()) as Session[] | undefined) ?? [];

      const dayStart = new Date(target);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const todaysSessions = sessionsData.filter((s) => {
        const d = new Date(s.createdAt);
        return d >= dayStart && d < dayEnd;
      });

      const focusSessions = todaysSessions.filter(
        (s) => s.type === "simple" || s.type === "pomodoro_focus"
      );
      const breakSessions = todaysSessions.filter(
        (s) => s.type === "manual_break" || s.type === "pomodoro_break"
      );

      const totalFocusSeconds = focusSessions.reduce((a, s) => a + s.durationSeconds, 0);
      const totalBreakSeconds = breakSessions.reduce((a, s) => a + s.durationSeconds, 0);

      // Format times in the BROWSER so they reflect the user's own timezone.
      // (Server-side Node runs in UTC, which would skew every "started at" line.)
      const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
      const formatLocalTime = (d: Date) => d.toLocaleTimeString(undefined, TIME_OPTS);

      // Sessions are returned newest-first; oldest = end of array
      const oldestFocus = focusSessions[focusSessions.length - 1];
      const dayStartedAtLabel = oldestFocus
        ? formatLocalTime(
            new Date(
              new Date(oldestFocus.createdAt).getTime() - oldestFocus.durationSeconds * 1000
            )
          )
        : null;

      const focusPayload = focusSessions.map((s) => {
        const endTime = new Date(s.createdAt);
        const startTime = new Date(endTime.getTime() - s.durationSeconds * 1000);
        return {
          label: s.projectName ?? s.taskName ?? "Independent work",
          durationSeconds: s.durationSeconds,
          startedAt: startTime.toISOString(),
          startedAtLabel: formatLocalTime(startTime),
          endedAtLabel:   formatLocalTime(endTime),
        };
      });

      const breakPayload = breakSessions.map((s) => ({
        label: s.notes?.trim() || "Pomodoro break",
        durationSeconds: s.durationSeconds,
      }));

      const dateLabel = target.toLocaleDateString(undefined, {
        weekday: "long",
        year:    "numeric",
        month:   "long",
        day:     "numeric",
      });

      const res = await fetch(`${BASE}api/daily-debrief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateLabel,
          dateKey,
          dayStartedAtLabel,
          totalFocusSeconds,
          totalBreakSeconds,
          focusCount: focusSessions.length,
          breakCount: breakSessions.length,
          focusSessions: focusPayload,
          breakSessions: breakPayload,
          notes,
          regenerate,
        }),
      });

      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as { summary?: string; cached?: boolean };
      setSummaryText(data.summary || "Unable to generate summary.");
      setSummaryIsCached(!!data.cached);
      queryClient.invalidateQueries({ queryKey: ["daily-debriefs"] });
    } catch (err) {
      console.error("[daily-debrief] failed", err);
      setSummaryError("Something went wrong. Please try again.");
    } finally {
      setSummaryLoading(false);
    }
  }, [notes, queryClient]);

  const handleGenerateSummary = useCallback(async () => {
    setSummaryHistoryDate(null);
    setSummaryModalOpen(true);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    setSummaryDateKey(todayKey);
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText("");
    setSummaryIsCached(false);

    try {
      const existingRes = await fetch(`${BASE}api/daily-debriefs/${todayKey}`);
      if (existingRes.ok) {
        const existing = (await existingRes.json()) as { summary: string };
        setSummaryText(existing.summary);
        setSummaryIsCached(true);
        setSummaryLoading(false);
        return;
      }
    } catch {
      // ignore — fall through to generation
    }

    await generateDebrief(false);
  }, [generateDebrief]);

  const handleRegenerateSummary = useCallback(async () => {
    if (summaryHistoryDate) {
      await generateDebrief(true, summaryHistoryDate);
    } else {
      await generateDebrief(true);
    }
  }, [generateDebrief, summaryHistoryDate]);

  const handleViewHistoryDebrief = useCallback(async (dateKey: string) => {
    setSummaryHistoryDate(dateKey);
    setSummaryDateKey(dateKey);
    setSummaryModalOpen(true);
    setSummaryLoading(true);
    setSummaryError(null);
    setSummaryText("");
    setSummaryIsCached(true);

    try {
      const res = await fetch(`${BASE}api/daily-debriefs/${dateKey}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = (await res.json()) as { summary: string };
      setSummaryText(data.summary);
    } catch (err) {
      console.error("[daily-debrief] history fetch failed", err);
      setSummaryError("Couldn't load that debrief.");
    } finally {
      setSummaryLoading(false);
    }
  }, []);
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
    setActiveBreakEditId(null);

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

  // ─── Notes card drag handlers ─────────────────────────────────────────────

  const handleNotesDragDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    notesDraggingRef.current = true;
    notesDragStartYRef.current = e.clientY;
    notesDragStartHeightRef.current = notesCardHeight;
    setNotesAnimating(false);
  }, [notesCardHeight]);

  const handleNotesDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!notesDraggingRef.current) return;
    const delta = notesDragStartYRef.current - e.clientY; // drag up = positive = taller
    const maxH = window.innerHeight - 100;
    const newH = Math.max(200, Math.min(maxH, notesDragStartHeightRef.current + delta));
    setNotesCardHeight(newH);
  }, []);

  const handleNotesDragUp = useCallback(() => {
    notesDraggingRef.current = false;
  }, []);

  const handleToggleNotes = useCallback(() => {
    setNotesAnimating(true);
    const defaultH = Math.round(window.innerHeight * 0.35);
    if (notesCardHeight > defaultH) {
      setNotesCardHeight(defaultH);
    } else {
      setNotesCardHeight(Math.round(window.innerHeight * 0.75));
    }
  }, [notesCardHeight]);

  // Reset notes card height when navigating away from timer tab
  useEffect(() => {
    if (activeTab !== "timer") {
      setNotesAnimating(false);
      setNotesCardHeight(NOTES_DEFAULT_HEIGHT);
    }
  }, [activeTab]);

  /** Save a custom break type to localStorage and immediately start it */
  const handleAddCustomBreak = useCallback((input: string) => {
    const text = input.trim();
    if (!text) return;

    // Split into true grapheme clusters so ZWJ sequences like 🧘🏽‍♂️ stay intact
    const splitter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = [...splitter.segment(text)].map((s) => s.segment);
    const emojiTest = /\p{Extended_Pictographic}/u;
    const emojiSegments = segments.filter((c) => emojiTest.test(c));
    // Use the LAST emoji found (if any), fallback to 💤
    const emoji = emojiSegments.length > 0 ? emojiSegments[emojiSegments.length - 1] : "💤";
    // Remove all emoji graphemes from label — no partial characters left behind
    const label = segments.filter((c) => !emojiTest.test(c)).join("").trim() || text;

    // Pick next colour from rotating palette based on how many custom tiles exist
    const customCount = breakTypes.filter((b) => b.id.startsWith("custom_")).length;
    const bg = CUSTOM_BREAK_COLORS[customCount % CUSTOM_BREAK_COLORS.length];

    const newBreak = { id: `custom_${Date.now()}`, label, emoji, bg };
    const updated = [...breakTypes, newBreak];
    setBreakTypes(updated);
    localStorage.setItem("breakTypes", JSON.stringify(updated));
    setShowCustomBreakInput(false);
    setBreakCustomInput("");
    handleStartManualBreak(`${label} ${emoji}`);
  }, [breakTypes, handleStartManualBreak]);

  /** Remove any break type (default or custom) by id */
  const handleDeleteBreakType = useCallback((id: string) => {
    const updated = breakTypes.filter((b) => b.id !== id);
    setBreakTypes(updated);
    localStorage.setItem("breakTypes", JSON.stringify(updated));
    setActiveBreakEditId(null);
  }, [breakTypes]);

  /** Long-press start — activates per-tile edit mode for that specific tile */
  const handleBreakPressStart = useCallback((id: string) => {
    breakDidLongPressRef.current = false;
    breakLongPressRef.current = setTimeout(() => {
      breakDidLongPressRef.current = true;
      setActiveBreakEditId(id);
      if (navigator.vibrate) navigator.vibrate(40);
    }, 500);
  }, []);

  const handleBreakPressEnd = useCallback(() => {
    if (breakLongPressRef.current) {
      clearTimeout(breakLongPressRef.current);
      breakLongPressRef.current = null;
    }
  }, []);

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
                  <div className="relative w-full max-w-md h-full flex flex-col">

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

                    {/* ── Notes bottom sheet — absolute, slides over timer ── */}
                    <div
                      className="absolute left-0 right-0 bottom-0 z-20 flex flex-col rounded-t-3xl bg-background shadow-lg ring-1 ring-border/40 focus-within:ring-2 focus-within:ring-border/70 transition-shadow"
                      style={{
                        height: notesCardHeight,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: notesAnimating ? "height 0.38s cubic-bezier(0.22,1,0.36,1)" : "none",
                      }}
                    >
                      {/* Drag handle — grab this to resize */}
                      <div
                        className="flex justify-center pt-2 pb-1 shrink-0 touch-none cursor-grab active:cursor-grabbing"
                        style={{ userSelect: "none" }}
                        onPointerDown={handleNotesDragDown}
                        onPointerMove={handleNotesDragMove}
                        onPointerUp={handleNotesDragUp}
                        onPointerCancel={handleNotesDragUp}
                      >
                        <div className="w-10 h-1 rounded-full" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }} />
                      </div>

                      {/* NotesArea card fills the rest */}
                      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                          onToggleExpand={handleToggleNotes}
                          isExpanded={isNotesExpanded}
                          onGenerateSummary={handleGenerateSummary}
                          isGeneratingSummary={summaryLoading}
                        />
                      </div>
                    </div>

                  </div>
                </main>
              )}

              {tab === "tasks" && <TasksTab isActive={activeTab === "tasks"} />}
              {tab === "stats" && <StatsTab onViewDebrief={handleViewHistoryDebrief} />}

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
                // If a tile is in edit mode, just exit that; otherwise dismiss sheet
                if (activeBreakEditId !== null) {
                  setActiveBreakEditId(null);
                  return;
                }
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
              className="fixed bottom-0 left-0 right-0 z-50 bg-card rounded-t-3xl px-6 pt-5 pb-8 shadow-xl"
              style={{ maxHeight: "60vh" }}
            >
              {/* Drag handle */}
              <div className="w-10 h-1 bg-border/40 rounded-full mx-auto mb-4" />

              {/* Header row — title + conditional Done button */}
              <div className="flex items-center justify-between mb-4">
                <div className="w-14" />
                <h2 className="text-base font-semibold text-foreground">Take a Break</h2>
                <div className="w-14 flex justify-end">
                  <motion.button
                    animate={{ opacity: activeBreakEditId !== null ? 1 : 0 }}
                    transition={{ duration: 0.15, ease: "easeInOut" }}
                    style={{
                      pointerEvents: activeBreakEditId !== null ? "auto" : "none",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#333",
                      padding: "8px 12px",
                    }}
                    onClick={() => setActiveBreakEditId(null)}
                  >
                    Done
                  </motion.button>
                </div>
              </div>

              {/* Grid — strict 3-col, scrollable, overflow-x hidden to prevent jitter */}
              <div className="relative" style={{ overflowX: "hidden" }}>
                <div
                  className={`grid gap-3 break-grid-scroll${breakGridScrolling ? " is-scrolling" : ""}`}
                  style={{
                    gridTemplateColumns: "repeat(3, 1fr)",
                    maxHeight: "220px",
                    overflowY: "auto",
                    overflowX: "hidden",
                    scrollBehavior: "smooth",
                    paddingTop: "6px",
                    paddingBottom: "8px",
                  }}
                  onScroll={() => {
                    setBreakGridScrolling(true);
                    if (breakScrollTimerRef.current) clearTimeout(breakScrollTimerRef.current);
                    breakScrollTimerRef.current = setTimeout(() => setBreakGridScrolling(false), 800);
                  }}
                >
                  {[
                    ...breakTypes,
                    { id: "__add__", label: "+ Custom", emoji: "✏️", bg: "#F2F2F7" },
                  ].map(({ id, label, emoji, bg }) => {
                    const isAddTile     = id === "__add__";
                    const isActiveEdit  = id === activeBreakEditId;
                    return (
                      <motion.button
                        key={id}
                        className="relative flex flex-col items-center justify-center gap-1.5 rounded-2xl text-center select-none"
                        style={{
                          background: bg,
                          minHeight: "72px",
                          padding: "16px 8px",
                          willChange: "transform",
                        }}
                        animate={isActiveEdit ? { rotate: [-1, 1, -1, 1, 0] } : { rotate: 0 }}
                        transition={
                          isActiveEdit
                            ? { duration: 0.22, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }
                            : { duration: 0.15 }
                        }
                        onPointerDown={() => { if (!isAddTile) handleBreakPressStart(id); }}
                        onPointerUp={handleBreakPressEnd}
                        onPointerLeave={handleBreakPressEnd}
                        onPointerCancel={handleBreakPressEnd}
                        whileTap={activeBreakEditId !== null ? undefined : { scale: 0.93 }}
                        onClick={() => {
                          if (breakDidLongPressRef.current) { breakDidLongPressRef.current = false; return; }
                          if (activeBreakEditId !== null) { setActiveBreakEditId(null); return; }
                          if (isAddTile) { setShowCustomBreakInput((v) => !v); return; }
                          handleStartManualBreak(`${label} ${emoji}`);
                        }}
                      >
                        <span className="text-2xl leading-none">{emoji}</span>
                        <span className="text-[11px] font-medium text-foreground/70 leading-tight">{label}</span>

                        {/* ❌ delete badge — any tile, only when it's the active edit tile */}
                        {isActiveEdit && !isAddTile && (
                          <motion.button
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={{ type: "spring", stiffness: 420, damping: 18 }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setPendingDeleteBreakId(id); }}
                            className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shadow-md"
                            aria-label={`Delete ${label}`}
                          >
                            <svg viewBox="0 0 10 10" className="w-2.5 h-2.5">
                              <path d="M2 2 L8 8 M8 2 L2 8" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                            </svg>
                          </motion.button>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                {/* Bottom-fade hint to signal scrollability */}
                <div
                  className="pointer-events-none absolute bottom-0 left-0 right-0 h-8"
                  style={{ background: "linear-gradient(to bottom, transparent, var(--card))" }}
                />
              </div>

              {/* Custom label input — slides in below the grid */}
              <AnimatePresence>
                {showCustomBreakInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    {/* px-px + pb-2 give the focus ring room */}
                    <div className="flex gap-2 mt-3 px-px pb-2">
                      <input
                        autoFocus
                        type="text"
                        placeholder='e.g. "Read 📚"'
                        value={breakCustomInput}
                        onChange={(e) => setBreakCustomInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddCustomBreak(breakCustomInput);
                        }}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-border/50 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <motion.button
                        onClick={() => handleAddCustomBreak(breakCustomInput)}
                        whileTap={{ scale: 0.95 }}
                        className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
                      >
                        Save
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Delete confirmation — slides up inside the sheet */}
              <AnimatePresence>
                {pendingDeleteBreakId !== null && (() => {
                  const target = breakTypes.find((b) => b.id === pendingDeleteBreakId);
                  if (!target) return null;
                  return (
                    <motion.div
                      key="delete-confirm"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 16 }}
                      transition={{ duration: 0.18, ease: "easeOut" }}
                      className="mt-4 rounded-2xl overflow-hidden"
                      style={{ background: "var(--card)", border: "1px solid hsl(var(--border) / 0.4)", boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}
                    >
                      <div className="px-5 py-4">
                        <p className="text-[15px] font-semibold text-foreground mb-0.5">
                          Delete "{target.emoji} {target.label}"?
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          This will remove it from your break list.
                        </p>
                      </div>
                      <div className="flex border-t border-border/40">
                        <button
                          className="flex-1 py-3.5 text-[14px] font-medium text-foreground/70 border-r border-border/40 active:bg-muted/50"
                          onClick={() => setPendingDeleteBreakId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          className="flex-1 py-3.5 text-[14px] font-semibold text-red-500 active:bg-red-50"
                          onClick={() => {
                            handleDeleteBreakType(pendingDeleteBreakId);
                            setPendingDeleteBreakId(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </motion.div>
                  );
                })()}
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

      {/* ───────── Daily Debrief modal ───────── */}
      <AnimatePresence>
        {summaryModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setSummaryModalOpen(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="w-full max-w-lg bg-card rounded-t-3xl p-6 pb-10 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-semibold">Daily Debrief</h2>
                </div>
                <button
                  onClick={() => setSummaryModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-secondary/60 flex items-center justify-center text-muted-foreground"
                  aria-label="Close debrief"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-muted-foreground/50 font-medium uppercase tracking-widest mb-4">
                {(() => {
                  const d = summaryDateKey
                    ? new Date(summaryDateKey + "T00:00:00")
                    : new Date();
                  return d.toLocaleDateString("en-US", {
                    weekday: "long",
                    month:   "long",
                    day:     "numeric",
                  });
                })()}
              </p>

              {summaryLoading && (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                  >
                    <Sparkles className="w-8 h-8 text-primary/60" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground/60">Analysing your day…</p>
                </div>
              )}

              {summaryError && (
                <p className="text-sm text-destructive text-center py-8">{summaryError}</p>
              )}

              {summaryText && !summaryLoading && (
                <>
                  <div className="prose prose-sm max-w-none">
                    {summaryText.split("\n\n").map((para, i) => (
                      <p
                        key={i}
                        className="text-[14px] leading-relaxed text-foreground/80 mb-4 last:mb-0"
                      >
                        {para}
                      </p>
                    ))}
                  </div>
                  {summaryIsCached && (
                    <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-muted-foreground/60">
                        Saved debrief — regenerate to refresh.
                      </p>
                      <motion.button
                        onClick={handleRegenerateSummary}
                        whileTap={{ scale: 0.96 }}
                        className="px-3 py-1.5 rounded-full bg-secondary/60 text-foreground/80 text-xs font-semibold hover:bg-secondary"
                      >
                        Regenerate
                      </motion.button>
                    </div>
                  )}
                </>
              )}
            </motion.div>
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
