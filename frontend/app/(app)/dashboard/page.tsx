"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, Flame } from "lucide-react";
import { fetchTasks } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const { session } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "dashboard"],
    queryFn: () => fetchTasks(),
    enabled: !!session,
  });

  const tasks = useMemo(() => data?.tasks ?? [], [data]);

  const stats = useMemo(() => {
    const overdue = tasks.filter(
      (t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== "done"
    ).length;
    const done = tasks.filter((t) => t.status === "done").length;
    const active = tasks.length - done;
    return { total: tasks.length, done, active, overdue };
  }, [tasks]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="text-white">{session?.email}</span> · team{" "}
          <span className="text-white">{session?.teamId}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
          <Skeleton className="h-28 rounded-lg" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-white/10 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CircleDashed className="h-4 w-4 text-primary" />
                Active work
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-white">{stats.active}</p>
              <p className="text-xs text-muted-foreground">Tasks not in Done</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-white">{stats.done}</p>
              <p className="text-xs text-muted-foreground">Out of {stats.total} visible tasks</p>
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-slate-900/40">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Flame className="h-4 w-4 text-amber-400" />
                Overdue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold text-white">{stats.overdue}</p>
              <p className="text-xs text-muted-foreground">Past deadline & not done</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-white/10 bg-gradient-to-br from-slate-900/60 to-slate-950/60">
        <CardHeader>
          <CardTitle className="text-base">Open the board</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Drag tasks between columns. Status updates call the Express API, which enforces team rules in DynamoDB
            queries.
          </p>
          <Button asChild>
            <Link href="/board" className="gap-2">
              Go to Kanban
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
