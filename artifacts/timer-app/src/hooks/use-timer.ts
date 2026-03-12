import { useState, useEffect, useCallback, useRef } from "react";
import type { SessionType } from "@workspace/api-client-react/src/generated/api.schemas";

export type TimerMode = "simple" | "pomodoro";
export type PomodoroPhase = "focus" | "break";

export const POMODORO_FOCUS_SEC = 25 * 60;
export const POMODORO_BREAK_SEC = 5 * 60;

interface UseTimerProps {
  onLogSession: (type: SessionType, durationSeconds: number) => void;
}

export function useTimer({ onLogSession }: UseTimerProps) {
  const [mode, setMode] = useState<TimerMode>("pomodoro");
  const [phase, setPhase] = useState<PomodoroPhase>("focus");
  const [isActive, setIsActive] = useState(false);

  const [seconds, setSeconds] = useState(POMODORO_FOCUS_SEC);

  const startTimestampRef = useRef<number | null>(null);
  const elapsedAtPauseRef = useRef(0);

  const onLogSessionRef = useRef(onLogSession);
  onLogSessionRef.current = onLogSession;

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  function getElapsedSeconds(): number {
    if (startTimestampRef.current === null) return elapsedAtPauseRef.current;
    return elapsedAtPauseRef.current + Math.floor((Date.now() - startTimestampRef.current) / 1000);
  }

  function syncDisplay() {
    const elapsed = getElapsedSeconds();
    if (modeRef.current === "simple") {
      setSeconds(elapsed);
    } else {
      const phaseTotal = phaseRef.current === "focus" ? POMODORO_FOCUS_SEC : POMODORO_BREAK_SEC;
      setSeconds(Math.max(0, phaseTotal - elapsed));
    }
  }

  const handleSetMode = useCallback((newMode: TimerMode) => {
    setIsActive(false);
    setMode(newMode);
    startTimestampRef.current = null;
    elapsedAtPauseRef.current = 0;

    if (newMode === "simple") {
      setSeconds(0);
    } else {
      setPhase("focus");
      setSeconds(POMODORO_FOCUS_SEC);
    }
  }, []);

  const start = useCallback(() => {
    startTimestampRef.current = Date.now();
    setIsActive(true);
  }, []);

  const pause = useCallback(() => {
    elapsedAtPauseRef.current = getElapsedSeconds();
    startTimestampRef.current = null;
    setIsActive(false);
  }, []);

  const stop = useCallback(() => {
    const elapsed = getElapsedSeconds();
    startTimestampRef.current = null;
    elapsedAtPauseRef.current = 0;
    setIsActive(false);

    if (elapsed > 0) {
      let sessionType: SessionType = "simple";
      if (mode === "pomodoro") {
        sessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
      }
      onLogSessionRef.current(sessionType, elapsed);
    }

    if (mode === "simple") {
      setSeconds(0);
    } else {
      setSeconds(phase === "focus" ? POMODORO_FOCUS_SEC : POMODORO_BREAK_SEC);
    }
  }, [mode, phase]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isActive) {
      interval = setInterval(() => {
        syncDisplay();
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && isActiveRef.current) {
        syncDisplay();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (seconds === 0 && mode === "pomodoro" && isActive) {
      const elapsed = getElapsedSeconds();
      startTimestampRef.current = null;
      elapsedAtPauseRef.current = 0;
      setIsActive(false);

      const sessionType: SessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
      onLogSessionRef.current(sessionType, elapsed);

      if (phase === "focus") {
        setPhase("break");
        setSeconds(POMODORO_BREAK_SEC);
      } else {
        setPhase("focus");
        setSeconds(POMODORO_FOCUS_SEC);
      }
    }
  }, [seconds, mode, phase, isActive]);

  return {
    mode,
    phase,
    seconds,
    isActive,
    setMode: handleSetMode,
    start,
    pause,
    stop,
  };
}
