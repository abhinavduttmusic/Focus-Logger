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
  
  const elapsedRef = useRef(0);
  const onLogSessionRef = useRef(onLogSession);
  onLogSessionRef.current = onLogSession;

  const handleSetMode = useCallback((newMode: TimerMode) => {
    setIsActive(false);
    setMode(newMode);
    elapsedRef.current = 0;
    
    if (newMode === "simple") {
      setSeconds(0);
    } else {
      setPhase("focus");
      setSeconds(POMODORO_FOCUS_SEC);
    }
  }, []);

  const start = useCallback(() => setIsActive(true), []);
  const pause = useCallback(() => setIsActive(false), []);

  const stop = useCallback(() => {
    setIsActive(false);
    
    if (elapsedRef.current > 0) {
      let sessionType: SessionType = "simple";
      if (mode === "pomodoro") {
        sessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
      }
      onLogSessionRef.current(sessionType, elapsedRef.current);
    }

    elapsedRef.current = 0;
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
        elapsedRef.current += 1;
        
        setSeconds((currentSeconds) => {
          if (mode === "simple") {
            return currentSeconds + 1;
          } else {
            const nextSeconds = currentSeconds - 1;
            
            if (nextSeconds <= 0) {
              return 0;
            }
            return nextSeconds;
          }
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, mode]);

  useEffect(() => {
    if (seconds === 0 && mode === "pomodoro" && isActive) {
      setIsActive(false);
      
      const sessionType: SessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
      onLogSessionRef.current(sessionType, elapsedRef.current);
      elapsedRef.current = 0;
      
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
