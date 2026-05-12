"use client";

import type { CognitoUserSession } from "amazon-cognito-identity-js";
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from "amazon-cognito-identity-js";
import type { AuthSession, UserRole } from "./types";

let userPool: CognitoUserPool | null = null;

function getUserPool(): CognitoUserPool {
  if (userPool) return userPool;
  const UserPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID ?? "";
  const ClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "";
  if (!UserPoolId || !ClientId) {
    throw new Error("Missing NEXT_PUBLIC_COGNITO_USER_POOL_ID / NEXT_PUBLIC_COGNITO_CLIENT_ID");
  }
  userPool = new CognitoUserPool({ UserPoolId, ClientId });
  return userPool;
}

function decodeJwtPayload<T extends Record<string, unknown>>(jwt: string): T {
  const [, payload] = jwt.split(".");
  const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(json) as T;
}

function authSessionFromIdToken(
  idToken: string,
  usernameFallback: string
): AuthSession {
  const payload = decodeJwtPayload<{
    sub: string;
    email?: string;
    "custom:role"?: string;
    "custom:teamId"?: string;
  }>(idToken);
  const role = String(payload["custom:role"] ?? "employee").toLowerCase() as UserRole;
  const teamId = String(payload["custom:teamId"] ?? "");
  return {
    idToken,
    email: String(payload.email ?? usernameFallback),
    role: role === "manager" ? "manager" : "employee",
    teamId: teamId || (role === "manager" ? "management" : ""),
    userId: String(payload.sub),
  };
}

function authSessionFromCognitoSession(
  session: CognitoUserSession,
  usernameFallback: string
): AuthSession {
  return authSessionFromIdToken(session.getIdToken().getJwtToken(), usernameFallback);
}

/**
 * Cognito does not accept these keys back on completeNewPasswordChallenge.
 * See amazon-cognito-identity-js README (use case 23).
 */
function sanitizeUserAttributesForNewPassword(
  attrs: Record<string, unknown>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "email_verified" || key === "phone_number_verified") continue;
    if (key === "sub") continue;
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

export type SignInResult =
  | { kind: "SESSION"; session: AuthSession }
  | {
      kind: "NEW_PASSWORD_REQUIRED";
      user: CognitoUser;
      /** Current attributes from the challenge (plain object — safe to keep in React state). */
      userAttributes: Record<string, unknown>;
      /** Attribute names Cognito still requires before completing sign-in. */
      requiredAttributes: string[];
    };

/**
 * Password sign-in. Handles admin-created users that must set a first password
 * (NEW_PASSWORD_REQUIRED) without crashing when the SDK invokes the challenge callback.
 */
export function signInWithPassword(
  username: string,
  password: string
): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    const pool = getUserPool();
    const user = new CognitoUser({ Username: username, Pool: pool });
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve({
          kind: "SESSION",
          session: authSessionFromCognitoSession(session, username),
        });
      },
      onFailure: reject,
      newPasswordRequired: (userAttributes, requiredAttributes) => {
        const attrs =
          userAttributes && typeof userAttributes === "object"
            ? { ...(userAttributes as Record<string, unknown>) }
            : {};
        const required =
          Array.isArray(requiredAttributes) && requiredAttributes.length > 0
            ? (requiredAttributes as string[]).filter((a) => typeof a === "string")
            : [];
        resolve({
          kind: "NEW_PASSWORD_REQUIRED",
          user,
          userAttributes: attrs,
          requiredAttributes: required,
        });
      },
    });
  });
}

export function completeNewPasswordChallenge(
  user: CognitoUser,
  newPassword: string,
  userAttributesFromChallenge: Record<string, unknown>,
  attributeUpdates: Record<string, string> = {}
): Promise<AuthSession> {

  // Remove immutable Cognito attributes like email
  const {
    email,
    email_verified,
    phone_number,
    phone_number_verified,
    ...safeAttributes
  } = userAttributesFromChallenge as Record<string, unknown>;

  const merged: Record<string, unknown> = {
    ...safeAttributes,
    ...attributeUpdates,
  };

  const payload = sanitizeUserAttributesForNewPassword(merged);

  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(newPassword, payload, {
      onSuccess: (session) => {
        resolve(authSessionFromCognitoSession(session, user.getUsername()));
      },
      onFailure: reject,
    });
  });
}

export function signOut(): void {
  try {
    getUserPool().getCurrentUser()?.signOut();
  } catch {
    // pool not configured — nothing to sign out
  }
}
