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
  
  // Current time on the clock
  const [seconds, setSeconds] = useState(POMODORO_FOCUS_SEC);
  
  // Track elapsed time for the current running session separately 
  // (important for pomodoro if stopped early, and simple mode where seconds == elapsed)
  const elapsedRef = useRef(0);

  // Switch modes
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
    
    // Log session if any time elapsed
    if (elapsedRef.current > 0) {
      let sessionType: SessionType = "simple";
      if (mode === "pomodoro") {
        sessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
      }
      onLogSession(sessionType, elapsedRef.current);
    }

    // Reset clock
    elapsedRef.current = 0;
    if (mode === "simple") {
      setSeconds(0);
    } else {
      // In pomodoro, stopping resets the current phase
      setSeconds(phase === "focus" ? POMODORO_FOCUS_SEC : POMODORO_BREAK_SEC);
    }
  }, [mode, phase, onLogSession]);

  // Main timer loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    if (isActive) {
      interval = setInterval(() => {
        elapsedRef.current += 1;
        
        setSeconds((currentSeconds) => {
          if (mode === "simple") {
            return currentSeconds + 1;
          } else {
            // Pomodoro mode (countdown)
            const nextSeconds = currentSeconds - 1;
            
            // Phase completed naturally
            if (nextSeconds <= 0) {
              setIsActive(false);
              
              // Log completed phase
              const sessionType = phase === "focus" ? "pomodoro_focus" : "pomodoro_break";
              onLogSession(sessionType, elapsedRef.current);
              elapsedRef.current = 0;
              
              // Auto-switch phase
              if (phase === "focus") {
                setPhase("break");
                return POMODORO_BREAK_SEC;
              } else {
                setPhase("focus");
                return POMODORO_FOCUS_SEC;
              }
            }
            return nextSeconds;
          }
        });
      }, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, mode, phase, onLogSession]);

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
