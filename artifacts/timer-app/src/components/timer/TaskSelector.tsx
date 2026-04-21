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
const OFF_SCREEN = { top: -9999, left: -9999, width: 320 };

function computePanelPos(triggerEl: HTMLElement | null) {
  if (!triggerEl) return OFF_SCREEN;
  const rect = triggerEl.getBoundingClientRect();
  const panelWidth = Math.min(340, window.innerWidth - 16);
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
  const triggerRef = useRef<HTMLElement>(null);
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

  const toggle = () => {
    if (isOpen) close();
    else setIsOpen(true);
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
          initial={{ opacity: 0, y: -8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
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
    <div ref={containerRef}>
      {selectedTask ? (
        /* ── Task selected: compact chip ── */
        <div className="flex items-center gap-1">
          <button
            ref={triggerRef as React.RefObject<HTMLButtonElement>}
            onClick={toggle}
            className="flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-primary/7 border border-primary/12 text-primary/75 hover:bg-primary/12 hover:text-primary/90 transition-colors text-xs touch-manipulation max-w-[200px]"
          >
            <CircleCheck className="w-3 h-3 shrink-0" />
            <span className="font-medium truncate text-xs">{selectedTask.name}</span>
          </button>
          <button
            onClick={() => onSelectTask(null)}
            className="p-1.5 rounded-full text-muted-foreground/35 hover:text-muted-foreground/65 hover:bg-secondary/50 transition-colors shrink-0"
            aria-label="Clear task"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        /* ── No task: ghost chip ── */
        <button
          ref={triggerRef as React.RefObject<HTMLButtonElement>}
          onClick={toggle}
          className="flex items-center gap-1.5 px-3 py-0.5 rounded-full border border-dashed border-muted-foreground/25 text-muted-foreground/55 hover:text-muted-foreground/80 hover:border-muted-foreground/40 transition-colors text-xs touch-manipulation"
        >
          <CircleCheck className="w-3 h-3 shrink-0" />
          <span className="font-medium text-xs">Select Task</span>
        </button>
      )}

      {createPortal(panelContent, document.body)}
    </div>
  );
}
