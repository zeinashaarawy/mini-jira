"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { fetchTasks, updateTaskStatus } from "@/lib/api";
import type { Task, TaskStatus } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskDialog } from "@/components/task-dialog";

const COLUMNS: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "in_review", title: "In Review" },
  { id: "done", title: "Done" },
];

function priorityVariant(p: Task["priority"]) {
  switch (p) {
    case "urgent":
      return "destructive" as const;
    case "high":
      return "default" as const;
    default:
      return "secondary" as const;
  }
}

function DraggableTask({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (t: Task) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.taskId,
    data: { task },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.6 : 1 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 rounded-lg border border-white/10 bg-white/5 p-2 transition hover:bg-white/10"
    >
      <button
        type="button"
        aria-label="Drag task"
        className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/5 text-muted-foreground hover:bg-white/10"
        {...listeners}
        {...attributes}
      >
        ⣿
      </button>
      <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-white">{task.title}</p>
          <Badge variant={priorityVariant(task.priority)} className="shrink-0 capitalize">
            {task.priority}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
          <span className="rounded bg-white/5 px-2 py-0.5">Team {task.teamId}</span>
          {task.assigneeId ? (
            <span className="rounded bg-white/5 px-2 py-0.5">Assignee {task.assigneeId}</span>
          ) : null}
        </div>
      </button>
    </div>
  );
}

function Column({
  id,
  title,
  tasks,
  onOpenTask,
}: {
  id: TaskStatus;
  title: string;
  tasks: Task[];
  onOpenTask: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <Card
      ref={setNodeRef}
      className={`min-h-[420px] border-white/10 bg-slate-900/40 ${isOver ? "ring-2 ring-primary/60" : ""}`}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">{tasks.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/10 p-4 text-center text-sm text-muted-foreground">
            Drop tasks here
          </p>
        ) : (
          tasks.map((t) => <DraggableTask key={t.taskId} task={t} onOpen={onOpenTask} />)
        )}
      </CardContent>
    </Card>
  );
}

export default function BoardPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [teamFilter, setTeamFilter] = useState<string>("");
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["tasks", session?.role, teamFilter],
    queryFn: () =>
      fetchTasks({
        teamId: session?.role === "manager" && teamFilter ? teamFilter : undefined,
      }),
    enabled: !!session,
  });

  const tasks = useMemo(() => data?.tasks ?? [], [data]);

  const grouped = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
    };
    for (const t of tasks) {
      map[t.status].push(t);
    }
    for (const k of Object.keys(map) as TaskStatus[]) {
      map[k].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    }
    return map;
  }, [tasks]);

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => updateTaskStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Status updated");
    },
    onError: () => toast.error("Could not update status"),
  });

  const onDragEnd = (event: DragEndEvent) => {
    const taskId = String(event.active.id);
    const overId = event.over?.id;
    if (!overId) return;
    const nextStatus = overId as TaskStatus;
    const task = tasks.find((t) => t.taskId === taskId);
    if (!task || task.status === nextStatus) return;
    mutation.mutate({ id: taskId, status: nextStatus });
  };

  const teams = useMemo(() => {
    const s = new Set<string>();
    for (const t of tasks) s.add(t.teamId);
    return Array.from(s).sort();
  }, [tasks]);

  if (isError) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        Failed to load tasks: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Kanban</h1>
          <p className="text-sm text-muted-foreground">
            Drag cards across columns. Employees only see their team; managers can filter by team.
          </p>
        </div>
        {session?.role === "manager" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["tasks"] })}>
              Refresh
            </Button>
            <Select
              value={teamFilter || "all"}
              onValueChange={(v) => setTeamFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger className="w-[220px] border-white/15 bg-white/5">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams (Scan)</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => qc.invalidateQueries({ queryKey: ["tasks"] })}>
            Refresh
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => (
            <Skeleton key={c.id} className="h-[420px] rounded-lg" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <Column
                key={col.id}
                id={col.id}
                title={col.title}
                tasks={grouped[col.id]}
                onOpenTask={setActiveTask}
              />
            ))}
          </div>
        </DndContext>
      )}

      <TaskDialog task={activeTask} open={!!activeTask} onOpenChange={(o) => !o && setActiveTask(null)} />
    </div>
  );
}
