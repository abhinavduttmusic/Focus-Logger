import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useCreateTask,
  useDeleteTask,
  useUpdateTask,
  useListProjects,
  useCreateProject,
  useDeleteProject,
  getListTasksQueryKey,
  getListProjectsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { Tag, X, Plus, FolderPlus, Folder, Loader2, Trash2, Pencil, Check } from "lucide-react";
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
  const [isCreating, setIsCreating] = useState(false);

  const [newTaskName, setNewTaskName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isCreatingProjectStandalone, setIsCreatingProjectStandalone] = useState(false);
  const [standaloneProjectName, setStandaloneProjectName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteProjectId, setConfirmDeleteProjectId] = useState<number | null>(null);
  const [renamingTaskId, setRenamingTaskId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState(OFF_SCREEN);
  const queryClient = useQueryClient();

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

  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: (_data, vars) => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        if (selectedTask?.id === vars.id) onSelectTask(null);
        setConfirmDeleteId(null);
      }
    }
  });

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        if (selectedTask?.id === data.id) {
          onSelectTask(data);
        }
        setRenamingTaskId(null);
        setRenameValue("");
      }
    }
  });

  const deleteProject = useDeleteProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setConfirmDeleteProjectId(null);
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

  const createProjectStandalone = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setIsCreatingProjectStandalone(false);
        setStandaloneProjectName("");
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
    setIsCreatingProjectStandalone(false);
    setStandaloneProjectName("");
    setSearchQuery("");
    setConfirmDeleteId(null);
    setConfirmDeleteProjectId(null);
    setRenamingTaskId(null);
    setRenameValue("");
    setPanelPos(OFF_SCREEN);
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
      data: { name: newProjectName.trim() }
    });
  };

  const handleCreateProjectStandalone = async () => {
    if (!standaloneProjectName.trim()) return;
    createProjectStandalone.mutate({
      data: { name: standaloneProjectName.trim() }
    });
  };

  const filteredTasks = tasks?.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())) || [];
  const trimmedSearch = searchQuery.trim();
  const hasExactMatch = tasks?.some(t => t.name.toLowerCase() === trimmedSearch.toLowerCase()) ?? false;
  const showInlineCreate = trimmedSearch.length > 0 && !hasExactMatch && !createTask.isPending;

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

  const isSearching = trimmedSearch.length > 0;

  function handleRenameSubmit(taskId: number) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    updateTask.mutate({ id: taskId, data: { name: trimmed } });
  }

  function renderTaskRow(task: Task) {
    const isConfirming = confirmDeleteId === task.id;
    const isRenaming = renamingTaskId === task.id;

    if (isConfirming) {
      return (
        <div
          key={task.id}
          className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20"
        >
          <span className="flex-1 text-sm font-medium text-destructive truncate">Delete &ldquo;{task.name}&rdquo;?</span>
          <button
            onClick={() => setConfirmDeleteId(null)}
            className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary/60 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteTask.mutate({ id: task.id })}
            disabled={deleteTask.isPending}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {deleteTask.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
          </button>
        </div>
      );
    }

    if (isRenaming) {
      return (
        <div
          key={task.id}
          className="flex items-center gap-2 p-1.5 rounded-xl bg-primary/5 border border-primary/20"
        >
          <Tag className="w-3.5 h-3.5 shrink-0 text-primary ml-1" />
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit(task.id);
              if (e.key === "Escape") { setRenamingTaskId(null); setRenameValue(""); }
            }}
            className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50 min-w-0"
            placeholder="Task name"
          />
          <button
            onClick={() => { setRenamingTaskId(null); setRenameValue(""); }}
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/60 transition-colors shrink-0"
            aria-label="Cancel rename"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleRenameSubmit(task.id)}
            disabled={!renameValue.trim() || updateTask.isPending}
            className="p-1.5 mr-0.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 shrink-0"
            aria-label="Confirm rename"
          >
            {updateTask.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
      );
    }

    return (
      <div
        key={task.id}
        className={cn(
          "group/task flex items-center gap-2 rounded-xl transition-colors",
          selectedTask?.id === task.id ? "bg-primary/10" : "hover:bg-secondary/60"
        )}
      >
        <button
          onClick={() => {
            onSelectTask(task);
            resetAndClose();
          }}
          className="flex-1 flex items-center gap-2.5 p-2.5 text-left touch-manipulation min-w-0"
        >
          <Tag className={cn("w-3.5 h-3.5 shrink-0", selectedTask?.id === task.id ? "text-primary" : "text-muted-foreground/50")} />
          <div className="flex-1 flex items-baseline gap-2 min-w-0">
            <span className={cn("font-medium text-sm truncate", selectedTask?.id === task.id ? "text-primary" : "text-foreground/80")}>
              {task.name}
            </span>
            {isSearching && task.projectName && (
              <span className="text-xs text-muted-foreground/60 truncate shrink-0">{task.projectName}</span>
            )}
          </div>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDeleteId(null);
            setConfirmDeleteProjectId(null);
            setRenamingTaskId(task.id);
            setRenameValue(task.name);
          }}
          className="p-1.5 rounded-lg text-muted-foreground/30 hover:text-foreground/70 hover:bg-secondary/60 transition-colors opacity-0 group-hover/task:opacity-100 focus:opacity-100 shrink-0"
          aria-label="Rename task"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setRenamingTaskId(null);
            setRenameValue("");
            setConfirmDeleteId(task.id);
          }}
          className="p-1.5 mr-1.5 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/task:opacity-100 focus:opacity-100 shrink-0"
          aria-label="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
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
      return (
        <>
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
          {filteredTasks.length > 0 ? (
            <div className="space-y-0.5">
              {filteredTasks.map(task => renderTaskRow(task))}
            </div>
          ) : !showInlineCreate && !createTask.isPending ? (
            <div className="text-center p-6 text-sm text-muted-foreground">
              No tasks found
            </div>
          ) : null}
        </>
      );
    }

    const { withProject, independent } = groupedTasks;
    const hasAny = withProject.length > 0 || independent.length > 0;

    if (!hasAny) {
      return (
        <div className="text-center p-6 text-sm text-muted-foreground">
          No tasks yet. Create one below.
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {withProject.length > 0 && independent.length > 0 && (
          <div className="flex items-center gap-2 px-2.5 py-1">
            <FolderPlus className="w-3 h-3 text-muted-foreground/50" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">
              Projects
            </span>
          </div>
        )}
        {withProject.map(({ project, tasks: projectTasks }) => (
          <div key={project.id}>
            {confirmDeleteProjectId === project.id ? (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20">
                <span className="flex-1 text-sm font-medium text-destructive truncate">Delete &ldquo;{project.name}&rdquo;?</span>
                <button
                  onClick={() => setConfirmDeleteProjectId(null)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteProject.mutate({ id: project.id })}
                  disabled={deleteProject.isPending}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  {deleteProject.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Delete"}
                </button>
              </div>
            ) : (
              <div className="group/project flex items-center gap-2 px-2.5 py-1.5">
                <Folder className="w-3.5 h-3.5 text-primary/50" />
                <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                  {project.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDeleteProjectId(project.id);
                  }}
                  className="p-1 rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/project:opacity-100 focus:opacity-100 shrink-0"
                  aria-label="Delete project"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
            {confirmDeleteProjectId !== project.id && (
              projectTasks.length > 0 ? (
                <div className="space-y-0.5 ml-1">
                  {projectTasks.map(task => renderTaskRow(task))}
                </div>
              ) : (
                <div className="ml-6 py-1.5 text-xs italic text-muted-foreground/40">
                  No tasks yet
                </div>
              )
            )}
          </div>
        ))}

        {independent.length > 0 && (
          <div>
            {withProject.length > 0 && (
              <div className="flex items-center gap-2 px-2.5 py-1.5">
                <Tag className="w-3.5 h-3.5 text-muted-foreground/50" />
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
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width, visibility: panelPos === OFF_SCREEN ? "hidden" : "visible" }}
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
                    onChange={(e) => { setSearchQuery(e.target.value); setConfirmDeleteId(null); }}
                    className="w-full bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                  />
                </div>

                {renderTaskList()}

                {!isSearching && (
                  <div className="px-2 pt-2 mt-2 border-t border-border/30 space-y-1.5">
                    {isCreatingProjectStandalone ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Project name..."
                          value={standaloneProjectName}
                          onChange={(e) => setStandaloneProjectName(e.target.value)}
                          className="flex-1 bg-secondary/30 border border-border/50 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                          autoFocus
                        />
                        <button
                          onClick={handleCreateProjectStandalone}
                          disabled={!standaloneProjectName.trim() || createProjectStandalone.isPending}
                          className="shrink-0 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                        >
                          {createProjectStandalone.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add"}
                        </button>
                        <button
                          onClick={() => { setIsCreatingProjectStandalone(false); setStandaloneProjectName(""); }}
                          className="shrink-0 px-2 py-2 rounded-xl bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsCreating(true)}
                          className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl text-sm font-medium text-primary hover:bg-primary/5 transition-colors border border-dashed border-primary/20 hover:border-primary/40 touch-manipulation"
                        >
                          <Plus className="w-4 h-4" />
                          <span>New Task</span>
                        </button>
                        <button
                          onClick={() => setIsCreatingProjectStandalone(true)}
                          className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors border border-dashed border-border/40 hover:border-border/60 touch-manipulation"
                        >
                          <FolderPlus className="w-4 h-4" />
                          <span>New Project</span>
                        </button>
                      </div>
                    )}
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
  );

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
        <button
          ref={triggerRef}
          onClick={() => { if (isOpen) { resetAndClose(); } else { setIsOpen(true); } }}
          className="flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/50 active:bg-secondary/70 active:scale-95 rounded-full transition-transform duration-75 text-sm font-medium border border-transparent hover:border-border/50 touch-manipulation"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>Select Task</span>
        </button>
      )}

      {createPortal(panelContent, document.body)}
    </div>
  );
}
