"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CognitoUser } from "amazon-cognito-identity-js";
import { toast } from "sonner";
import {
  completeNewPasswordChallenge,
  signInWithPassword,
} from "@/lib/cognito";
import type { AuthSession } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function cognitoErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Something went wrong";
}

function finalizeLogin(s: AuthSession, setSession: (s: AuthSession) => void, router: ReturnType<typeof useRouter>) {
  if (s.role === "employee" && !s.teamId) {
    toast.error("Cognito user is missing custom:teamId");
    return false;
  }
  setSession(s);
  toast.success("Welcome back");
  router.replace("/dashboard");
  return true;
}

export default function LoginPage() {
  const { session, hydrated, setSession } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const challengeUserRef = useRef<CognitoUser | null>(null);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [challengeAttrs, setChallengeAttrs] = useState<Record<string, unknown>>({});
  const [requiredAttrs, setRequiredAttrs] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [attrEdits, setAttrEdits] = useState<Record<string, string>>({});
  const [challengeLoading, setChallengeLoading] = useState(false);

  useEffect(() => {
    if (hydrated && session) router.replace("/dashboard");
  }, [hydrated, session, router]);

  /** When the challenge dialog opens, seed editable fields for required attributes. */
  useEffect(() => {
    if (!challengeOpen) return;
    const next: Record<string, string> = {};
    for (const key of requiredAttrs) {
      const v = challengeAttrs[key];
      next[key] = v === undefined || v === null ? "" : String(v);
    }
    setAttrEdits(next);
  }, [challengeOpen, requiredAttrs, challengeAttrs]);

  function resetChallengeState() {
    challengeUserRef.current = null;
    setChallengeOpen(false);
    setChallengeAttrs({});
    setRequiredAttrs([]);
    setNewPassword("");
    setConfirmPassword("");
    setAttrEdits({});
    setChallengeLoading(false);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await signInWithPassword(username, password);
      if (result.kind === "SESSION") {
        finalizeLogin(result.session, setSession, router);
      } else {
        challengeUserRef.current = result.user;
        setChallengeAttrs(result.userAttributes);
        setRequiredAttrs(result.requiredAttributes);
        setNewPassword("");
        setConfirmPassword("");
        setChallengeOpen(true);
        toast.info("Set a new password", {
          description: "Your account requires a new password before you can continue.",
        });
      }
    } catch (err) {
      console.error(err);
      toast.error(cognitoErrorMessage(err) || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onCompleteNewPassword(e: React.FormEvent) {
    e.preventDefault();
    const user = challengeUserRef.current;
    if (!user) {
      toast.error("Session expired — please sign in again");
      resetChallengeState();
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    for (const key of requiredAttrs) {
      if (!String(attrEdits[key] ?? "").trim()) {
        toast.error(`Please fill in: ${key}`);
        return;
      }
    }

    setChallengeLoading(true);
    try {
      const sessionOut = await completeNewPasswordChallenge(
        user,
        newPassword,
        challengeAttrs,
        attrEdits
      );
      resetChallengeState();
      finalizeLogin(sessionOut, setSession, router);
    } catch (err) {
      console.error(err);
      toast.error(cognitoErrorMessage(err) || "Could not update password");
    } finally {
      setChallengeLoading(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-950 text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-slate-950 to-slate-900 px-4">
      <Card className="w-full max-w-md border-white/10 bg-slate-900/60 shadow-xl backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl text-white">Sign in</CardTitle>
          <CardDescription className="text-muted-foreground">
            Uses Amazon Cognito (USER_PASSWORD_AUTH). Users must include{" "}
            <code className="rounded bg-white/10 px-1">custom:role</code> and{" "}
            <code className="rounded bg-white/10 px-1">custom:teamId</code> on the ID token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={challengeOpen}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={challengeOpen}
              />
            </div>
            <Button className="w-full" type="submit" disabled={loading || challengeOpen}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={challengeOpen}
        onOpenChange={(open) => {
          if (!open && !challengeLoading) resetChallengeState();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onPointerDownOutside={(ev) => {
            if (challengeLoading) ev.preventDefault();
          }}
          onEscapeKeyDown={(ev) => {
            if (challengeLoading) ev.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Your administrator created this account with a temporary password. Choose a new password to finish
            signing in.
          </p>
          <form className="space-y-4" onSubmit={onCompleteNewPassword}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={challengeLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={challengeLoading}
              />
            </div>

            {requiredAttrs.length > 0 ? (
              <div className="space-y-3 rounded-md border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-medium text-muted-foreground">Required profile fields</p>
                {requiredAttrs.map((key) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`attr-${key}`} className="capitalize">
                      {key.replace(/_/g, " ")}
                    </Label>
                    <Input
                      id={`attr-${key}`}
                      value={attrEdits[key] ?? ""}
                      onChange={(e) =>
                        setAttrEdits((prev) => ({
                          ...prev,
                          [key]: e.target.value,
                        }))
                      }
                      disabled={challengeLoading}
                      autoComplete="off"
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={challengeLoading}
                onClick={() => resetChallengeState()}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={challengeLoading}>
                {challengeLoading ? "Saving…" : "Continue"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
