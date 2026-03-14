import { useState, useEffect, useCallback, useRef } from "react";
import type { SessionType } from "@workspace/api-client-react/src/generated/api.schemas";
import { hapticLight, hapticDouble } from "./use-haptics";

export type TimerMode = "simple" | "pomodoro";
export type PomodoroPhase = "focus" | "break";

export const POMODORO_FOCUS_SEC = 25 * 60;
export const POMODORO_BREAK_SEC = 5 * 60;

export interface TimerInitialState {
  mode: TimerMode;
  phase: PomodoroPhase;
  isActive: boolean;
  startTimestamp: number | null;
  elapsedAtPause: number;
}

interface UseTimerProps {
  onLogSession: (type: SessionType, durationSeconds: number) => void;
  initialState?: TimerInitialState;
}

function computeInitialSeconds(state: TimerInitialState): number {
  const elapsed = state.startTimestamp !== null
    ? state.elapsedAtPause + Math.floor((Date.now() - state.startTimestamp) / 1000)
    : state.elapsedAtPause;

  if (state.mode === "simple") return elapsed;
  const phaseTotal = state.phase === "focus" ? POMODORO_FOCUS_SEC : POMODORO_BREAK_SEC;
  return Math.max(0, phaseTotal - elapsed);
}

export function useTimer({ onLogSession, initialState }: UseTimerProps) {
  const [mode, setMode] = useState<TimerMode>(initialState?.mode ?? "pomodoro");
  const [phase, setPhase] = useState<PomodoroPhase>(initialState?.phase ?? "focus");
  const [isActive, setIsActive] = useState(initialState?.isActive ?? false);

  const [seconds, setSeconds] = useState(() =>
    initialState ? computeInitialSeconds(initialState) : POMODORO_FOCUS_SEC
  );

  const startTimestampRef = useRef<number | null>(initialState?.startTimestamp ?? null);
  const elapsedAtPauseRef = useRef(initialState?.elapsedAtPause ?? 0);

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
    const currentElapsed = getElapsedSeconds();
    const wasActive = isActiveRef.current;

    setMode(newMode);

    if (currentElapsed > 0) {
      elapsedAtPauseRef.current = currentElapsed;
      startTimestampRef.current = wasActive ? Date.now() : null;

      if (newMode === "simple") {
        setSeconds(currentElapsed);
      } else {
        setPhase("focus");
        setSeconds(Math.max(0, POMODORO_FOCUS_SEC - currentElapsed));
      }
    } else {
      setIsActive(false);
      startTimestampRef.current = null;
      elapsedAtPauseRef.current = 0;

      if (newMode === "simple") {
        setSeconds(0);
      } else {
        setPhase("focus");
        setSeconds(POMODORO_FOCUS_SEC);
      }
    }
  }, []);

  const start = useCallback(() => {
    startTimestampRef.current = Date.now();
    setIsActive(true);
    hapticLight();
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
    hapticLight();

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

  const reset = useCallback(() => {
    startTimestampRef.current = null;
    elapsedAtPauseRef.current = 0;
    setIsActive(false);
    if (mode === "simple") {
      setSeconds(0);
    } else {
      setPhase("focus");
      setSeconds(POMODORO_FOCUS_SEC);
    }
  }, [mode]);

  const restartAs = useCallback((targetMode: TimerMode) => {
    setMode(targetMode);
    startTimestampRef.current = Date.now();
    elapsedAtPauseRef.current = 0;
    if (targetMode === "simple") {
      setSeconds(0);
      setPhase("focus");
    } else {
      setPhase("focus");
      setSeconds(POMODORO_FOCUS_SEC);
    }
    setIsActive(true);
  }, []);

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
      hapticDouble();

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
    startTimestamp: startTimestampRef.current,
    elapsedAtPause: elapsedAtPauseRef.current,
    setMode: handleSetMode,
    start,
    pause,
    stop,
    reset,
    restartAs,
  };
}
