import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useListProjects,
  useCreateTask,
  useCreateProject,
  useUpdateTask,
  useUpdateProject,
  useDeleteTask,
  useDeleteProject,
  getListTasksQueryKey,
  getListProjectsQueryKey,
  getListSessionsQueryKey,
} from "@workspace/api-client-react";
import type { Task, Project } from "@workspace/api-client-react/src/generated/api.schemas";
import {
  Folder, FolderOpen, FolderPlus, FolderInput,
  CircleCheck, CirclePlus,
  ChevronRight, Pencil, Trash2, Check, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TasksTabProps {
  isActive: boolean;
}

const EASE = [0.22, 1, 0.36, 1] as const;

const ICON_BTN =
  "p-1.5 min-w-[30px] min-h-[30px] flex items-center justify-center rounded-lg transition-colors duration-100 shrink-0";

// ─── Project Status ───────────────────────────────────────────────────────────

type ProjectStatus = "ongoing" | "suspended" | "completed";

const STATUS_CYCLE: Record<ProjectStatus, ProjectStatus> = {
  ongoing: "suspended",
  suspended: "completed",
  completed: "ongoing",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  ongoing: "Ongoing",
  suspended: "Suspended",
  completed: "Completed",
};

const STATUS_STYLES: Record<ProjectStatus, string> = {
  ongoing:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  suspended:
    "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  completed:
    "bg-secondary/70 text-muted-foreground/55",
};

function useProjectStatuses() {
  const [statuses, setStatuses] = useState<Record<number, ProjectStatus>>(() => {
    try {
      return JSON.parse(localStorage.getItem("tm-project-statuses") ?? "{}");
    } catch {
      return {};
    }
  });
  useEffect(() => {
    localStorage.setItem("tm-project-statuses", JSON.stringify(statuses));
  }, [statuses]);
  function getStatus(id: number): ProjectStatus {
    return statuses[id] ?? "ongoing";
  }
  function cycleStatus(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setStatuses(prev => ({ ...prev, [id]: STATUS_CYCLE[prev[id] ?? "ongoing"] }));
  }
  return { getStatus, cycleStatus };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TasksTab({ isActive }: TasksTabProps) {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading: tasksLoading } = useListTasks();
  const { data: projects = [], isLoading: projectsLoading } = useListProjects();

  const loading = tasksLoading || projectsLoading;

  const [collapsedProjects, setCollapsedProjects] = useState<Set<number>>(new Set());

  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");

  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskName, setEditingTaskName] = useState("");
  const [editingTaskProjectId, setEditingTaskProjectId] = useState<number | null | undefined>(undefined);

  const [deletingProjectId, setDeletingProjectId] = useState<number | null>(null);
  const [deletingProjectId2, setDeletingProjectId2] = useState<number | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<number | null>(null);
  const [deletingTaskId2, setDeletingTaskId2] = useState<number | null>(null);

  const [movingTaskId, setMovingTaskId] = useState<number | null>(null);

  const [addMode, setAddMode] = useState<"task" | "project" | null>(null);
  const [newName, setNewName] = useState("");
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | null>(null);

  const addInputRef = useRef<HTMLInputElement>(null);

  const { getStatus, cycleStatus } = useProjectStatuses();

  useEffect(() => {
    if (addMode && addInputRef.current) {
      setTimeout(() => addInputRef.current?.focus(), 80);
    }
  }, [addMode]);

  const grouped = useMemo(() => {
    const byProject = new Map<number, { project: Project; tasks: Task[] }>();
    const independent: Task[] = [];
    for (const p of projects) {
      byProject.set(p.id, { project: p, tasks: [] });
    }
    for (const t of tasks) {
      if (t.projectId && byProject.has(t.projectId)) {
        byProject.get(t.projectId)!.tasks.push(t);
      } else {
        independent.push(t);
      }
    }
    return { withProject: Array.from(byProject.values()), independent };
  }, [tasks, projects]);

  const movingTask = movingTaskId !== null ? tasks.find(t => t.id === movingTaskId) : null;

  // ── mutations ────────────────────────────────────────────────────────────────

  const createTask = useCreateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setAddMode(null);
        setNewName("");
        setNewTaskProjectId(null);
      },
    },
  });

  const createProject = useCreateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        setAddMode(null);
        setNewName("");
      },
    },
  });

  const updateTask = useUpdateTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        setEditingTaskId(null);
        setEditingTaskName("");
        setEditingTaskProjectId(undefined);
        setMovingTaskId(null);
      },
    },
  });

  const updateProject = useUpdateProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setEditingProjectId(null);
        setEditingProjectName("");
      },
    },
  });

  const deleteTask = useDeleteTask({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setDeletingTaskId(null);
        setDeletingTaskId2(null);
      },
    },
  });

  const deleteProject = useDeleteProject({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        setDeletingProjectId(null);
        setDeletingProjectId2(null);
      },
    },
  });

  // ── helpers ──────────────────────────────────────────────────────────────────

  function toggleCollapse(id: number) {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearEditing() {
    setEditingProjectId(null);
    setEditingProjectName("");
    setEditingTaskId(null);
    setEditingTaskName("");
    setEditingTaskProjectId(undefined);
    setDeletingProjectId(null);
    setDeletingProjectId2(null);
    setDeletingTaskId(null);
    setDeletingTaskId2(null);
  }

  function startEditProject(p: Project) {
    clearEditing();
    setMovingTaskId(null);
    setEditingProjectId(p.id);
    setEditingProjectName(p.name);
  }

  function startEditTask(t: Task) {
    clearEditing();
    setMovingTaskId(null);
    setEditingTaskId(t.id);
    setEditingTaskName(t.name);
    setEditingTaskProjectId(t.projectId ?? null);
  }

  function startMoveTask(t: Task) {
    clearEditing();
    setMovingTaskId(t.id);
  }

  function submitProjectRename() {
    if (!editingProjectName.trim() || editingProjectId === null) return;
    updateProject.mutate({ id: editingProjectId, data: { name: editingProjectName.trim() } });
  }

  function submitTaskEdit() {
    if (editingTaskId === null) return;
    const task = tasks.find(t => t.id === editingTaskId);
    if (!task) return;
    const data: { name?: string; projectId?: number | null } = {};
    if (editingTaskName.trim() && editingTaskName.trim() !== task.name) {
      data.name = editingTaskName.trim();
    }
    if (editingTaskProjectId !== undefined && editingTaskProjectId !== (task.projectId ?? null)) {
      data.projectId = editingTaskProjectId;
    }
    if (Object.keys(data).length === 0) {
      clearEditing();
      return;
    }
    updateTask.mutate({ id: editingTaskId, data });
  }

  function handleMoveTask(destinationProjectId: number | null) {
    if (movingTaskId === null) return;
    updateTask.mutate({ id: movingTaskId, data: { projectId: destinationProjectId } });
  }

  function handleAddSubmit() {
    if (!newName.trim()) return;
    if (addMode === "project") {
      createProject.mutate({ data: { name: newName.trim() } });
    } else if (addMode === "task") {
      createTask.mutate({ data: { name: newName.trim(), projectId: newTaskProjectId } });
    }
  }

  function openAddTask(projectId: number | null = null) {
    clearEditing();
    setMovingTaskId(null);
    setAddMode("task");
    setNewName("");
    setNewTaskProjectId(projectId);
  }

  function openAddProject() {
    clearEditing();
    setMovingTaskId(null);
    setAddMode("project");
    setNewName("");
  }

  const isPending =
    createTask.isPending ||
    createProject.isPending ||
    updateTask.isPending ||
    updateProject.isPending ||
    deleteTask.isPending ||
    deleteProject.isPending;

  // ── task row ─────────────────────────────────────────────────────────────────

  function renderTaskRow(task: Task, inProject: boolean) {
    const isEditing = editingTaskId === task.id;
    const isDeleting1 = deletingTaskId === task.id;
    const isDeleting2 = deletingTaskId2 === task.id;

    if (isDeleting2) {
      return (
        <motion.div
          key={`del2-${task.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: EASE }}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-destructive/10 border border-destructive/20"
        >
          <span className="flex-1 text-xs text-destructive font-medium truncate">
            Delete &ldquo;{task.name}&rdquo; permanently?
          </span>
          <button
            onClick={() => deleteTask.mutate({ id: task.id })}
            disabled={deleteTask.isPending}
            className="px-2.5 py-1 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-semibold disabled:opacity-50 shrink-0"
          >
            {deleteTask.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
          </button>
          <button
            onClick={() => { setDeletingTaskId(null); setDeletingTaskId2(null); }}
            className="px-2.5 py-1 rounded-lg bg-secondary text-foreground/70 text-[11px] font-medium shrink-0"
          >
            No
          </button>
        </motion.div>
      );
    }

    if (isDeleting1) {
      return (
        <motion.div
          key={`del1-${task.id}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14, ease: EASE }}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-muted/50 border border-border/30"
        >
          <span className="flex-1 text-xs text-foreground/80 truncate">
            Delete &ldquo;{task.name}&rdquo;?
          </span>
          <button
            onClick={() => setDeletingTaskId2(task.id)}
            className="px-2.5 py-1 rounded-lg bg-destructive/90 text-destructive-foreground text-[11px] font-semibold shrink-0"
          >
            Delete
          </button>
          <button
            onClick={() => setDeletingTaskId(null)}
            className="px-2.5 py-1 rounded-lg bg-secondary text-foreground/70 text-[11px] font-medium shrink-0"
          >
            Cancel
          </button>
        </motion.div>
      );
    }

    if (isEditing) {
      return (
        <motion.div
          key={`edit-${task.id}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.16, ease: EASE }}
          className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3"
        >
          <div className="flex items-center gap-2">
            <CircleCheck className="w-3.5 h-3.5 text-primary shrink-0" />
            <input
              autoFocus
              value={editingTaskName}
              onChange={e => setEditingTaskName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitTaskEdit();
                if (e.key === "Escape") clearEditing();
              }}
              placeholder="Task name"
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/50 min-w-0"
            />
          </div>
          <div className="flex items-center gap-2">
            <FolderInput className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <select
              value={editingTaskProjectId ?? ""}
              onChange={e =>
                setEditingTaskProjectId(e.target.value ? Number(e.target.value) : null)
              }
              className="flex-1 bg-secondary/40 border border-border/40 rounded-lg px-2.5 py-1.5 text-xs outline-none text-foreground/80 min-w-0"
            >
              <option value="">Independent (no project)</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={clearEditing}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/60 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={submitTaskEdit}
              disabled={updateTask.isPending}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              {updateTask.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Check className="w-3 h-3" />}
              Save
            </button>
          </div>
        </motion.div>
      );
    }

    return (
      <motion.div
        key={task.id}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.18, ease: EASE }}
        className="flex items-center gap-2.5 rounded-xl px-3 min-h-[48px] py-2"
      >
        <CircleCheck className="w-3.5 h-3.5 text-muted-foreground/35 shrink-0" />
        <span className="flex-1 text-sm font-medium text-foreground/85 truncate min-w-0">
          {task.name}
          {!inProject && task.projectName && (
            <span className="ml-2 text-xs font-normal text-muted-foreground/50">
              {task.projectName}
            </span>
          )}
        </span>
        <div className="flex items-center gap-0.5 shrink-0 opacity-60 hover:opacity-100 transition-opacity duration-100">
          <button
            onClick={e => { e.stopPropagation(); startMoveTask(task); }}
            className={cn(ICON_BTN, "hover:text-primary/80 hover:bg-primary/8 active:text-primary text-muted-foreground/70")}
            aria-label="Move task"
          >
            <FolderInput className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); startEditTask(task); }}
            className={cn(ICON_BTN, "hover:text-foreground/80 hover:bg-secondary/60 active:text-foreground text-muted-foreground/70")}
            aria-label="Edit task"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              clearEditing();
              setMovingTaskId(null);
              setDeletingTaskId(task.id);
            }}
            className={cn(ICON_BTN, "hover:text-destructive hover:bg-destructive/8 active:text-destructive text-muted-foreground/70")}
            aria-label="Delete task"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    );
  }

  // ── project section ───────────────────────────────────────────────────────────

  function renderProjectSection({
    project,
    tasks: projectTasks,
  }: {
    project: Project;
    tasks: Task[];
  }) {
    const isCollapsed = collapsedProjects.has(project.id);
    const isEditing = editingProjectId === project.id;
    const isDeleting1 = deletingProjectId === project.id;
    const isDeleting2 = deletingProjectId2 === project.id;
    const status = getStatus(project.id);

    return (
      <motion.div
        key={project.id}
        layout
        className="rounded-[18px] border border-border/25 bg-card shadow-[0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden"
      >
        {isDeleting2 ? (
          <div className="flex items-center gap-2 px-4 py-3.5 bg-destructive/10">
            <span className="flex-1 text-xs text-destructive font-medium">
              Delete &ldquo;{project.name}&rdquo; permanently? Tasks will become independent.
            </span>
            <button
              onClick={() => deleteProject.mutate({ id: project.id })}
              disabled={deleteProject.isPending}
              className="px-2.5 py-1 rounded-lg bg-destructive text-destructive-foreground text-[11px] font-semibold disabled:opacity-50 shrink-0"
            >
              {deleteProject.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes"}
            </button>
            <button
              onClick={() => { setDeletingProjectId(null); setDeletingProjectId2(null); }}
              className="px-2.5 py-1 rounded-lg bg-secondary text-foreground/70 text-[11px] font-medium shrink-0"
            >
              No
            </button>
          </div>
        ) : isDeleting1 ? (
          <div className="flex items-center gap-2 px-4 py-3.5 bg-muted/40">
            <span className="flex-1 text-xs text-foreground/80">
              Delete project &ldquo;{project.name}&rdquo;?
            </span>
            <button
              onClick={() => setDeletingProjectId2(project.id)}
              className="px-2.5 py-1 rounded-lg bg-destructive/90 text-destructive-foreground text-[11px] font-semibold shrink-0"
            >
              Delete
            </button>
            <button
              onClick={() => setDeletingProjectId(null)}
              className="px-2.5 py-1 rounded-lg bg-secondary text-foreground/70 text-[11px] font-medium shrink-0"
            >
              Cancel
            </button>
          </div>
        ) : isEditing ? (
          <div className="flex items-center gap-2 px-4 py-4 bg-primary/5 border-b border-primary/10">
            <Folder className="w-4 h-4 text-primary shrink-0" />
            <input
              autoFocus
              value={editingProjectName}
              onChange={e => setEditingProjectName(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") submitProjectRename();
                if (e.key === "Escape") clearEditing();
              }}
              className="flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/50 min-w-0"
            />
            <button
              onClick={clearEditing}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={submitProjectRename}
              disabled={!editingProjectName.trim() || updateProject.isPending}
              className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 shrink-0"
            >
              {updateProject.isPending
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Check className="w-3.5 h-3.5" />}
            </button>
          </div>
        ) : (
          /* Normal header */
          <div
            className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none active:bg-secondary/30 transition-colors"
            onClick={() => toggleCollapse(project.id)}
          >
            {isCollapsed
              ? <Folder className="w-4 h-4 text-muted-foreground/55 shrink-0" />
              : <FolderOpen className="w-4 h-4 text-muted-foreground/55 shrink-0" />
            }
            <span className="flex-1 text-[14px] font-semibold text-foreground truncate min-w-0">
              {project.name}
            </span>
            {/* Task count */}
            <span className="text-[11px] font-medium text-muted-foreground/55 bg-secondary/70 px-2 py-0.5 rounded-full shrink-0 tabular-nums">
              {projectTasks.length}
            </span>
            {/* Status badge — tap to cycle */}
            <button
              onClick={e => cycleStatus(project.id, e)}
              className={cn(
                "text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 transition-colors duration-150",
                STATUS_STYLES[status]
              )}
              aria-label={`Status: ${STATUS_LABELS[status]} — tap to change`}
            >
              {STATUS_LABELS[status]}
            </button>
            {/* Action icons */}
            <div className="flex items-center gap-0.5 shrink-0">
              <span
                role="button"
                onClick={e => { e.stopPropagation(); startEditProject(project); }}
                className={cn(ICON_BTN, "text-muted-foreground/45 hover:text-foreground/80 hover:bg-secondary/60 active:text-foreground")}
                aria-label="Rename project"
              >
                <Pencil className="w-3.5 h-3.5" />
              </span>
              <span
                role="button"
                onClick={e => {
                  e.stopPropagation();
                  clearEditing();
                  setMovingTaskId(null);
                  setDeletingProjectId(project.id);
                }}
                className={cn(ICON_BTN, "text-muted-foreground/45 hover:text-destructive hover:bg-destructive/8 active:text-destructive")}
                aria-label="Delete project"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </span>
            </div>
            <motion.div
              animate={{ rotate: isCollapsed ? 0 : 90 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="shrink-0 text-muted-foreground/35"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          </div>
        )}

        {/* Task list */}
        <AnimatePresence initial={false}>
          {!isCollapsed && !isDeleting1 && !isDeleting2 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/15">
                <div className="px-2 py-1 space-y-0.5">
                  <AnimatePresence initial={false}>
                    {projectTasks.length > 0
                      ? projectTasks.map(t => renderTaskRow(t, true))
                      : (
                        <motion.p
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.14 }}
                          className="px-3 py-3 text-xs italic text-muted-foreground/40"
                        >
                          No tasks yet.
                        </motion.p>
                      )
                    }
                  </AnimatePresence>
                </div>
                {/* Add Task inside project */}
                <div className="border-t border-border/12">
                  <button
                    onClick={e => { e.stopPropagation(); openAddTask(project.id); }}
                    className="flex items-center gap-2.5 w-full px-4 py-3 text-muted-foreground/45 hover:text-muted-foreground/70 hover:bg-secondary/20 active:bg-secondary/30 transition-colors"
                  >
                    <CirclePlus className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[13px] font-medium">Add Task</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full">
      <div className="overflow-y-auto h-full pt-6 pb-10 px-4 sm:px-6">
        <div className="w-full max-w-2xl mx-auto">

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Task Manager
            </h1>
          </div>

          {loading ? (
            <div className="flex justify-center pt-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-8">

              {/* Projects section */}
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3 px-0.5">
                  Projects
                </p>
                <div className="space-y-2">
                  {grouped.withProject.map(g => renderProjectSection(g))}
                </div>
                {/* Add Project row */}
                <button
                  onClick={openAddProject}
                  className="mt-2 flex items-center gap-3 w-full px-4 py-3.5 rounded-[14px] border border-dashed border-border/50 text-muted-foreground/50 hover:text-muted-foreground/75 hover:bg-secondary/20 active:bg-secondary/30 transition-colors"
                >
                  <FolderPlus className="w-4 h-4 shrink-0" />
                  <span className="text-sm font-medium">Add Project</span>
                </button>
              </section>

              {/* Independent Tasks section */}
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3 px-0.5">
                  Independent Tasks
                </p>
                <div className="rounded-[18px] border border-border/25 bg-card shadow-[0_4px_16px_rgba(0,0,0,0.06)] overflow-hidden">
                  {grouped.independent.length === 0 ? (
                    <p className="px-4 py-3.5 text-sm text-muted-foreground/40 italic">
                      No independent tasks.
                    </p>
                  ) : (
                    <div className="px-2 py-1 space-y-0.5">
                      <AnimatePresence initial={false}>
                        {grouped.independent.map(t => renderTaskRow(t, false))}
                      </AnimatePresence>
                    </div>
                  )}
                  {/* Add Task row */}
                  <div className={cn("border-t border-border/15", grouped.independent.length === 0 && "border-t-0")}>
                    <button
                      onClick={() => openAddTask(null)}
                      className="flex items-center gap-3 w-full px-4 py-3.5 text-muted-foreground/50 hover:text-muted-foreground/70 hover:bg-secondary/20 active:bg-secondary/30 transition-colors"
                    >
                      <CirclePlus className="w-4 h-4 shrink-0" />
                      <span className="text-sm font-medium">Add Task</span>
                    </button>
                  </div>
                </div>
              </section>

            </div>
          )}
        </div>
      </div>

      {/* Add form sheet */}
      <AnimatePresence>
        {addMode !== null && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="absolute bottom-0 left-0 right-0 z-30 bg-card border-t border-border/40 shadow-[0_-8px_32px_rgba(0,0,0,0.08)] px-4 sm:px-6 pb-[env(safe-area-inset-bottom,0px)]"
          >
            <div className="w-full max-w-2xl mx-auto py-5 space-y-4">
              <div className="flex items-center gap-3">
                {addMode === "project"
                  ? <Folder className="w-4 h-4 text-primary shrink-0" />
                  : <CircleCheck className="w-4 h-4 text-primary shrink-0" />
                }
                <span className="text-sm font-semibold text-foreground">
                  {addMode === "project" ? "New Project" : "New Task"}
                </span>
                <button
                  onClick={() => { setAddMode(null); setNewName(""); setNewTaskProjectId(null); }}
                  className="ml-auto p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <input
                ref={addInputRef}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAddSubmit();
                  if (e.key === "Escape") { setAddMode(null); setNewName(""); }
                }}
                placeholder={addMode === "project" ? "Project name" : "Task name"}
                className="w-full bg-secondary/30 border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
              />

              {addMode === "task" && (
                <div className="flex items-center gap-2">
                  <FolderInput className="w-4 h-4 text-muted-foreground shrink-0" />
                  <select
                    value={newTaskProjectId ?? ""}
                    onChange={e => setNewTaskProjectId(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 bg-secondary/40 border border-border/40 rounded-xl px-3 py-2.5 text-sm outline-none text-foreground/80"
                  >
                    <option value="">Independent (no project)</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleAddSubmit}
                disabled={!newName.trim() || isPending}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
              >
                {isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />
                }
                {addMode === "project" ? "Create Project" : "Create Task"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Move Task sheet */}
      <AnimatePresence>
        {movingTaskId !== null && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: EASE }}
              className="absolute inset-0 z-30 bg-black/[0.18]"
              onClick={() => setMovingTaskId(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="absolute bottom-0 left-0 right-0 z-40 bg-card border-t border-border/40 shadow-[0_-8px_32px_rgba(0,0,0,0.10)] px-4 sm:px-6 pb-[env(safe-area-inset-bottom,0px)]"
            >
              <div className="w-full max-w-2xl mx-auto py-5 space-y-3">
                <div className="flex items-center gap-3 pb-1">
                  <FolderInput className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Move Task</p>
                    {movingTask && (
                      <p className="text-xs text-muted-foreground/60 truncate">
                        &ldquo;{movingTask.name}&rdquo;
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setMovingTaskId(null)}
                    className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <button
                    onClick={() => handleMoveTask(null)}
                    disabled={updateTask.isPending}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-150 text-left",
                      movingTask?.projectId == null
                        ? "bg-primary/8 border-primary/20 text-foreground"
                        : "bg-secondary/20 border-border/30 text-foreground/80 hover:bg-secondary/40"
                    )}
                  >
                    <CircleCheck className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                    <span className="text-sm font-medium">Independent Tasks</span>
                    {movingTask?.projectId == null && (
                      <span className="ml-auto text-xs text-primary/70 font-medium">current</span>
                    )}
                  </button>

                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleMoveTask(p.id)}
                      disabled={updateTask.isPending}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors duration-150 text-left",
                        movingTask?.projectId === p.id
                          ? "bg-primary/8 border-primary/20 text-foreground"
                          : "bg-secondary/20 border-border/30 text-foreground/80 hover:bg-secondary/40"
                      )}
                    >
                      <Folder className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                      <span className="text-sm font-medium truncate">{p.name}</span>
                      {movingTask?.projectId === p.id && (
                        <span className="ml-auto text-xs text-primary/70 font-medium shrink-0">current</span>
                      )}
                      {updateTask.isPending && movingTaskId !== null && (
                        <Loader2 className="ml-auto w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
