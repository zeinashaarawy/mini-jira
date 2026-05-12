import type { Request, Response, NextFunction } from "express";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { config } from "../config/env";
import type { UserRole } from "../types/models";
import { HttpError } from "../utils/errors";

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!config.cognitoUserPoolId || !config.cognitoClientId) {
    return null;
  }
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: config.cognitoUserPoolId,
      tokenUse: "id",
      clientId: config.cognitoClientId,
    });
  }
  return verifier;
}

function parseRole(v: unknown): UserRole {
  const s = String(v ?? "").toLowerCase();
  if (s === "manager") return "manager";
  if (s === "employee") return "employee";
  throw new HttpError(403, "Invalid or missing role claim");
}

/**
 * Verifies Cognito ID token, maps `custom:role` and `custom:teamId` onto req.user.
 * In development, if Cognito is not configured, optional `x-dev-user` header JSON can be used (local only).
 */
export async function cognitoAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (config.nodeEnv !== "production" && !getVerifier()) {
      const raw = req.header("x-dev-user");
      if (raw) {
        const parsed = JSON.parse(raw) as {
          userId: string;
          role: UserRole;
          teamId: string;
          email?: string;
          name?: string;
        };
        req.user = {
          userId: parsed.userId,
          role: parsed.role,
          teamId: parsed.teamId,
          email: parsed.email,
          name: parsed.name,
        };
        return next();
      }
    }

    const auth = req.header("authorization");
    if (!auth?.startsWith("Bearer "))
      throw new HttpError(401, "Missing bearer token");

    const token = auth.slice("Bearer ".length);
    const v = getVerifier();
    if (!v) throw new HttpError(500, "Cognito verifier not configured");

    const payload = await v.verify(token);

    const role = parseRole(payload["custom:role"] ?? payload["role"]);
    const teamId = String(payload["custom:teamId"] ?? payload["teamId"] ?? "");
    if (!teamId && role === "employee") {
      throw new HttpError(403, "Employee token missing custom:teamId");
    }

    req.user = {
      userId: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      role,
      teamId: teamId || "management",
    };
    next();
  } catch (e) {
    if (e instanceof HttpError) return next(e);
    next(new HttpError(401, "Invalid token"));
  }
}
