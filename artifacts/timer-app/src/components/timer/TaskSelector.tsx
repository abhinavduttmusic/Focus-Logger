import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  useListTasks,
  useListProjects,
} from "@workspace/api-client-react";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { CircleCheck, X, Folder, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskSelectorProps {
  selectedTask: Task | null;
  onSelectTask: (task: Task | null) => void;
}

const MAX_PANEL_HEIGHT = 400;
const OFF_SCREEN: { top: number; left: number; width: number } = { top: -9999, left: -9999, width: 320 };

function computePanelPos(triggerEl: HTMLButtonElement | null) {
  if (!triggerEl) return OFF_SCREEN;
  const rect = triggerEl.getBoundingClientRect();
  const panelWidth = Math.min(320, window.innerWidth - 16);
  let left = rect.left;
  if (left + panelWidth > window.innerWidth - 8) {
    left = window.innerWidth - panelWidth - 8;
  }
  let top = rect.bottom + 8;
  if (top + MAX_PANEL_HEIGHT > window.innerHeight) {
    top = Math.max(0, rect.top - MAX_PANEL_HEIGHT - 8);
  }
  return { top, left, width: panelWidth };
}

export function TaskSelector({ selectedTask, onSelectTask }: TaskSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState(OFF_SCREEN);

  const { data: tasks, isLoading: isLoadingTasks } = useListTasks();
  const { data: projects } = useListProjects();

  useLayoutEffect(() => {
    if (!isOpen) return;
    setPanelPos(computePanelPos(triggerRef.current));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => setPanelPos(computePanelPos(triggerRef.current));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const close = () => {
    setIsOpen(false);
    setSearchQuery("");
    setPanelPos(OFF_SCREEN);
  };

  const filteredTasks = tasks?.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const groupedTasks = useMemo(() => {
    const byProject = new Map<number, { project: { id: number; name: string }; tasks: Task[] }>();
    const independent: Task[] = [];
    if (projects) {
      for (const p of projects) {
        byProject.set(p.id, { project: { id: p.id, name: p.name }, tasks: [] });
      }
    }
    for (const task of filteredTasks) {
      if (task.projectId && task.projectName) {
        if (!byProject.has(task.projectId)) {
          byProject.set(task.projectId, { project: { id: task.projectId, name: task.projectName }, tasks: [] });
        }
        byProject.get(task.projectId)!.tasks.push(task);
      } else {
        independent.push(task);
      }
    }
    return { withProject: Array.from(byProject.values()), independent };
  }, [filteredTasks, projects]);

  const isSearching = searchQuery.trim().length > 0;

  function renderTaskRow(task: Task) {
    return (
      <button
        key={task.id}
        onClick={() => { onSelectTask(task); close(); }}
        className={cn(
          "w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-colors touch-manipulation",
          selectedTask?.id === task.id ? "bg-primary/10" : "hover:bg-secondary/60"
        )}
      >
        <CircleCheck
          className={cn("w-3.5 h-3.5 shrink-0", selectedTask?.id === task.id ? "text-primary" : "text-muted-foreground/50")}
        />
        <div className="flex-1 flex items-baseline gap-2 min-w-0">
          <span className={cn("font-medium text-sm truncate", selectedTask?.id === task.id ? "text-primary" : "text-foreground/80")}>
            {task.name}
          </span>
          {isSearching && task.projectName && (
            <span className="text-xs text-muted-foreground/60 truncate shrink-0">{task.projectName}</span>
          )}
        </div>
      </button>
    );
  }

  function renderTaskList() {
    if (isLoadingTasks) {
      return (
        <div className="flex justify-center p-4">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (isSearching) {
      return filteredTasks.length > 0 ? (
        <div className="space-y-0.5">
          {filteredTasks.map(task => renderTaskRow(task))}
        </div>
      ) : (
        <div className="text-center p-6 text-sm text-muted-foreground">
          No tasks found
        </div>
      );
    }

    const { withProject, independent } = groupedTasks;
    const hasAny = withProject.some(g => g.tasks.length > 0) || independent.length > 0;

    if (!hasAny) {
      return (
        <div className="text-center p-6 text-sm text-muted-foreground leading-relaxed">
          No tasks yet — head to the<br />Tasks tab to add some.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {withProject.length > 0 && independent.length > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1">
            <Folder className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Projects
            </span>
          </div>
        )}

        {withProject.map(({ project, tasks: projectTasks }) => (
          <div key={project.id}>
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <Folder className="w-3.5 h-3.5 text-primary/50" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                {project.name}
              </span>
            </div>
            {projectTasks.length > 0 ? (
              <div className="space-y-0.5 ml-1">
                {projectTasks.map(task => renderTaskRow(task))}
              </div>
            ) : (
              <div className="ml-6 py-1.5 text-xs italic text-muted-foreground/40">
                No tasks yet
              </div>
            )}
          </div>
        ))}

        {independent.length > 0 && (
          <div>
            {withProject.length > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <CircleCheck className="w-3.5 h-3.5 text-muted-foreground/50" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                  Independent Tasks
                </span>
              </div>
            )}
            <div className="space-y-0.5 ml-1">
              {independent.map(task => renderTaskRow(task))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const panelContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ duration: 0.1, ease: "easeOut" }}
          className="fixed z-[9999] glass-panel bg-card border-border/50 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[400px]"
          style={{
            top: panelPos.top,
            left: panelPos.left,
            width: panelPos.width,
            visibility: panelPos === OFF_SCREEN ? "hidden" : "visible",
          }}
        >
          <div className="p-3 border-b border-border/30 flex items-center justify-between bg-card/50">
            <span className="text-sm font-semibold pl-1">Select a task</span>
            <button
              onClick={close}
              className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-[150px] p-2 pb-3 space-y-1">
            <div className="px-2 pb-2">
              <input
                type="text"
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
              />
            </div>

            {renderTaskList()}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="w-full" ref={containerRef}>
      {selectedTask ? (
        <div className="flex items-center gap-2 max-w-fit">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-full transition-colors text-sm font-medium">
            <CircleCheck className="w-3.5 h-3.5 text-primary/70" />
            <span className="text-foreground/90 truncate max-w-[200px]">{selectedTask.name}</span>
            {selectedTask.projectName && (
              <>
                <span className="text-muted-foreground/40 text-xs">·</span>
                <span className="text-muted-foreground/70 text-xs truncate max-w-[120px]">{selectedTask.projectName}</span>
              </>
            )}
            <button
              onClick={() => onSelectTask(null)}
              className="ml-1 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => { if (isOpen) { close(); } else { setIsOpen(true); } }}
          className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary/70 active:scale-95 rounded-full transition-transform duration-75 text-sm font-medium border border-transparent hover:border-border/50 touch-manipulation"
        >
          <CircleCheck className="w-3.5 h-3.5" />
          <span>Select Task</span>
        </button>
      )}

      {createPortal(panelContent, document.body)}
    </div>
  );
}
