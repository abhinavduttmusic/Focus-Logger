import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateSession, getListSessionsQueryKey } from "@workspace/api-client-react";
import type { SessionType, Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { useTimer } from "@/hooks/use-timer";

import { TimerToggle } from "@/components/timer/TimerToggle";
import { TimerDisplay } from "@/components/timer/TimerDisplay";
import { NotesArea } from "@/components/timer/NotesArea";
import { SessionList } from "@/components/timer/SessionList";

export default function Home() {
  const [notes, setNotes] = useState("");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const queryClient = useQueryClient();
  
  const createSession = useCreateSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setNotes("");
      }
    }
  });

  const handleLogSession = (type: SessionType, durationSeconds: number) => {
    createSession.mutate({
      data: {
        type,
        durationSeconds,
        notes: notes.trim(),
        taskId: selectedTask?.id ?? null,
      }
    });
  };

  const timer = useTimer({
    onLogSession: handleLogSession
  });

  return (
    <main className="min-h-screen w-full py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      <div className="w-full max-w-2xl space-y-12">
        
        {/* Header / Mode Toggle */}
        <header className="text-center space-y-8">
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            Flow State
          </h1>
          <TimerToggle mode={timer.mode} onChange={timer.setMode} />
        </header>

        {/* Timer Section */}
        <section className="relative">
          {/* Decorative background glow behind timer */}
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

        {/* Notes Section */}
        <section>
          <NotesArea 
            value={notes} 
            onChange={setNotes} 
            selectedTask={selectedTask}
            onSelectTask={setSelectedTask}
          />
        </section>

        <div className="h-px w-full bg-gradient-to-r from-transparent via-border/60 to-transparent my-16" />

        {/* History Section */}
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
