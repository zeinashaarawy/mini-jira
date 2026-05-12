"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { AppShell } from "@/components/app-shell";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { session, hydrated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !session) router.replace("/login");
  }, [hydrated, session, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
