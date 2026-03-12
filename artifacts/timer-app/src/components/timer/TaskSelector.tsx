import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useCreateTask,
  useListProjects,
  useCreateProject,
  getListTasksQueryKey,
  getListProjectsQueryKey,
} from "@workspace/api-client-react";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { Tag, X, Plus, FolderPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskSelectorProps {
  selectedTask: Task | null;
  onSelectTask: (task: Task | null) => void;
}

export function TaskSelector({ selectedTask, onSelectTask }: TaskSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [newTaskName, setNewTaskName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const queryClient = useQueryClient();

  const MAX_PANEL_HEIGHT = 400;

  const { data: tasks, isLoading: isLoadingTasks } = useListTasks();
  const { data: projects, isLoading: isLoadingProjects } = useListProjects();

  const updatePanelPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = Math.min(320, window.innerWidth - 16);
    let left = rect.left;
    if (left + panelWidth > window.innerWidth - 8) {
      left = window.innerWidth - panelWidth - 8;
    }
    let top = rect.bottom + 8;
    if (top + MAX_PANEL_HEIGHT > window.innerHeight) {
      top = Math.max(0, rect.top - MAX_PANEL_HEIGHT - 8);
    }
    setPanelPos({ top, left, width: panelWidth });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [isOpen, updatePanelPosition]);

  useEffect(() => {
    if (isOpen && !isLoadingTasks && tasks?.length === 0) {
      setIsCreating(true);
    }
  }, [isOpen, isLoadingTasks, tasks]);

  const createTask = useCreateTask({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        onSelectTask(data);
        resetAndClose();
      }
    }
  });

  const createProject = useCreateProject({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setSelectedProjectId(data.id);
        setIsCreatingProject(false);
        setNewProjectName("");
      }
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        resetAndClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const resetAndClose = () => {
    setIsOpen(false);
    setIsCreating(false);
    setNewTaskName("");
    setSelectedProjectId(null);
    setNewProjectName("");
    setIsCreatingProject(false);
    setSearchQuery("");
    setPanelPos(null);
  };

  const handleCreateTask = async () => {
    if (!newTaskName.trim()) return;
    createTask.mutate({
      data: {
        name: newTaskName.trim(),
        projectId: selectedProjectId,
      }
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    createProject.mutate({
      data: {
        name: newProjectName.trim()
      }
    });
  };

  const filteredTasks = tasks?.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];
  const trimmedSearch = searchQuery.trim();
  const hasExactMatch = tasks?.some(t => t.name.toLowerCase() === trimmedSearch.toLowerCase()) ?? false;
  const showInlineCreate = trimmedSearch.length > 0 && !hasExactMatch && !createTask.isPending;

  return (
    <div className="w-full" ref={containerRef}>
      {selectedTask ? (
        <div className="flex items-center gap-2 max-w-fit">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 hover:bg-primary/10 border border-primary/10 rounded-full transition-colors text-sm font-medium">
            <Tag className="w-3.5 h-3.5 text-primary/70" />
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
        <motion.button
          ref={triggerRef}
          onClick={() => { if (isOpen) { resetAndClose(); } else { updatePanelPosition(); setIsOpen(true); } }}
          whileTap={{ scale: 0.93 }}
          className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary/70 rounded-full transition-colors text-sm font-medium border border-transparent hover:border-border/50 touch-manipulation"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Select Task</span>
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && panelPos && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className="fixed z-[9999] glass-panel bg-card border-border/50 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[400px]"
            style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
          >
            <div className="p-3 border-b border-border/30 flex items-center justify-between bg-card/50">
              <span className="text-sm font-semibold pl-1">Select a task</span>
              <button onClick={resetAndClose} className="p-1.5 rounded-lg hover:bg-secondary/80 text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-[150px] p-2 space-y-1">
              {!isCreating ? (
                <>
                  <div className="px-2 pb-2">
                    <input
                      type="text"
                      placeholder="Search tasks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                    />
                  </div>
                  
                  {showInlineCreate && (
                    <button
                      onClick={() => {
                        createTask.mutate({ data: { name: trimmedSearch, projectId: null } });
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-colors hover:bg-primary/5 text-primary touch-manipulation"
                    >
                      <Plus className="w-4 h-4 shrink-0" />
                      <span className="font-medium text-sm truncate">Create &ldquo;{trimmedSearch}&rdquo;</span>
                    </button>
                  )}

                  {createTask.isPending && (
                    <div className="flex items-center justify-center gap-2 p-4">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm text-muted-foreground">Creating task...</span>
                    </div>
                  )}

                  {isLoadingTasks ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : filteredTasks.length > 0 ? (
                    <div className="space-y-1">
                      {filteredTasks.map(task => (
                        <button
                          key={task.id}
                          onClick={() => {
                            onSelectTask(task);
                            resetAndClose();
                          }}
                          className={cn(
                            "w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-colors touch-manipulation",
                            selectedTask?.id === task.id ? "bg-primary/10 text-primary" : "hover:bg-secondary/60 text-foreground/80"
                          )}
                        >
                          <Tag className={cn("w-4 h-4 shrink-0", selectedTask?.id === task.id ? "text-primary" : "text-muted-foreground/50")} />
                          <div className="flex-1 flex items-baseline gap-2 min-w-0">
                            <span className="font-medium text-sm truncate">{task.name}</span>
                            {task.projectName && (
                              <span className="text-xs text-muted-foreground/60 truncate shrink-0">{task.projectName}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : !showInlineCreate && !createTask.isPending ? (
                    <div className="text-center p-6 text-sm text-muted-foreground">
                      No tasks found
                    </div>
                  ) : null}
                  
                  {!trimmedSearch && (
                    <div className="px-2 pt-2 mt-2 border-t border-border/30">
                      <button
                        onClick={() => setIsCreating(true)}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-colors border border-dashed border-primary/20 hover:border-primary/40 touch-manipulation"
                      >
                        <Plus className="w-4 h-4" />
                        <span>New Task</span>
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-3 space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">Task Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Update landing page"
                      value={newTaskName}
                      onChange={(e) => setNewTaskName(e.target.value)}
                      className="w-full bg-secondary/30 border border-border/50 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground ml-1">Project (Optional)</label>
                    
                    {!isCreatingProject ? (
                      <div className="flex gap-2">
                        <select
                          value={selectedProjectId || ""}
                          onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                          className="flex-1 bg-secondary/30 border border-border/50 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                        >
                          <option value="">No Project</option>
                          {projects?.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setIsCreatingProject(true)}
                          className="shrink-0 p-2.5 rounded-xl border border-border/50 bg-secondary/30 hover:bg-secondary/60 text-muted-foreground hover:text-foreground transition-colors"
                          title="New Project"
                        >
                          <FolderPlus className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Project name..."
                          value={newProjectName}
                          onChange={(e) => setNewProjectName(e.target.value)}
                          className="flex-1 bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                          autoFocus
                        />
                        <button
                          onClick={handleCreateProject}
                          disabled={!newProjectName.trim() || createProject.isPending}
                          className="shrink-0 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {createProject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                        </button>
                        <button
                          onClick={() => {
                            setIsCreatingProject(false);
                            setNewProjectName("");
                          }}
                          className="shrink-0 px-2 py-2 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setIsCreating(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium hover:bg-secondary/60 text-muted-foreground transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTask}
                      disabled={!newTaskName.trim() || createTask.isPending}
                      className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                      {createTask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Task"}
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
