import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTasks,
  useCreateTask,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import type { Task } from "@workspace/api-client-react/src/generated/api.schemas";
import { Tag, Plus, Loader2, ChevronDown, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionTaskPickerProps {
  currentTaskId: number | null;
  currentTaskName: string | null;
  onSelect: (task: { id: number; name: string; projectId: number | null; projectName: string | null } | null) => void;
}

const MAX_DROPDOWN_HEIGHT = 220;
const OFF_SCREEN = { top: -9999, left: -9999, width: 200 };

function computeDropdownPos(triggerEl: HTMLDivElement | null) {
  if (!triggerEl) return OFF_SCREEN;
  const rect = triggerEl.getBoundingClientRect();
  const width = rect.width;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) {
    left = window.innerWidth - width - 8;
  }
  let top = rect.bottom + 4;
  if (top + MAX_DROPDOWN_HEIGHT > window.innerHeight) {
    top = Math.max(0, rect.top - MAX_DROPDOWN_HEIGHT - 4);
  }
  return { top, left, width };
}

export function SessionTaskPicker({ currentTaskId, currentTaskName, onSelect }: SessionTaskPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [panelPos, setPanelPos] = useState(OFF_SCREEN);
  const queryClient = useQueryClient();

  const { data: tasks, isLoading } = useListTasks();

  const createTask = useCreateTask({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        onSelect({
          id: data.id,
          name: data.name,
          projectId: data.projectId ?? null,
          projectName: data.projectName ?? null,
        });
        setSearch("");
        setIsOpen(false);
      },
    },
  });

  useLayoutEffect(() => {
    if (!isOpen) {
      setPanelPos(OFF_SCREEN);
      return;
    }
    setPanelPos(computeDropdownPos(triggerRef.current));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => setPanelPos(computeDropdownPos(triggerRef.current));
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const filtered = tasks?.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const trimmed = search.trim();
  const hasExactMatch = tasks?.some(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase()
  ) ?? false;
  const showCreate = trimmed.length > 0 && !hasExactMatch && !createTask.isPending;

  const handleSelectTask = (task: Task) => {
    onSelect({
      id: task.id,
      name: task.name,
      projectId: task.projectId ?? null,
      projectName: task.projectName ?? null,
    });
    setSearch("");
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(null);
    setSearch("");
    setIsOpen(false);
  };

  const displayLabel = currentTaskName ?? "No task";

  const dropdownPanel = isOpen ? createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] bg-card border border-border/50 rounded-lg shadow-lg overflow-hidden flex flex-col"
      style={{
        top: panelPos.top,
        left: panelPos.left,
        width: panelPos.width,
        maxHeight: MAX_DROPDOWN_HEIGHT,
        visibility: panelPos === OFF_SCREEN ? "hidden" : "visible",
      }}
    >
      <div className="p-1.5">
        <input
          ref={inputRef}
          type="text"
          placeholder="Search or create..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && showCreate) {
              e.preventDefault();
              createTask.mutate({ data: { name: trimmed, projectId: null } });
            }
          }}
          className="w-full bg-secondary/30 border border-border/40 rounded-md px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/40"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-1 space-y-0.5">
        {!currentTaskId ? null : (
          <button
            type="button"
            onClick={handleClear}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary/40 transition-colors text-left"
          >
            <XIcon className="w-3 h-3 shrink-0" />
            <span>No task</span>
          </button>
        )}

        {isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {showCreate && (
              <button
                type="button"
                onClick={() => createTask.mutate({ data: { name: trimmed, projectId: null } })}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-primary hover:bg-primary/5 transition-colors text-left"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span className="truncate">Create &ldquo;{trimmed}&rdquo;</span>
              </button>
            )}

            {createTask.isPending && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Creating...</span>
              </div>
            )}

            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleSelectTask(task)}
                className={cn(
                  "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors text-left",
                  task.id === currentTaskId
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-secondary/40 text-foreground/80"
                )}
              >
                <Tag className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1">{task.name}</span>
                {task.projectName && (
                  <span className="text-[10px] text-muted-foreground/50 truncate shrink-0 ml-1">
                    {task.projectName}
                  </span>
                )}
              </button>
            ))}

            {filtered.length === 0 && !showCreate && !createTask.isPending && (
              <div className="text-center py-3 text-xs text-muted-foreground/50">
                No tasks found
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors w-full min-w-0 cursor-pointer",
          currentTaskId
            ? "border-primary/30 bg-primary/5 text-primary"
            : "border-border/50 bg-background/50 text-muted-foreground"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Tag className="w-3 h-3 shrink-0" />
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        {currentTaskId && (
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 p-0.5 rounded hover:bg-secondary/40 transition-colors"
            aria-label="Clear task"
          >
            <XIcon className="w-3 h-3 text-muted-foreground/50 hover:text-foreground" />
          </button>
        )}
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", isOpen && "rotate-180")} />
      </div>

      {dropdownPanel}
    </div>
  );
}
