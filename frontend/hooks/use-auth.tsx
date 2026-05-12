"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthSession } from "@/lib/types";
import { setAuthToken } from "@/lib/api";
import { signOut as cognitoSignOut } from "@/lib/cognito";

const STORAGE_KEY = "mini-jira-session";

type AuthContextValue = {
  session: AuthSession | null;
  hydrated: boolean;
  setSession: (s: AuthSession | null) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthSession;
        setSessionState(parsed);
        setAuthToken(parsed.idToken);
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  const setSession = useCallback((s: AuthSession | null) => {
    setSessionState(s);
    if (s) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      setAuthToken(s.idToken);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
      setAuthToken(null);
    }
  }, []);

  const signOut = useCallback(() => {
    cognitoSignOut();
    setSession(null);
  }, [setSession]);

  const value = useMemo(
    () => ({ session, hydrated, setSession, signOut }),
    [session, hydrated, setSession, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
