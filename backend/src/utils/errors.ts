import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import type { AuthUser } from "../types/models";

export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation error",
      details: err.flatten(),
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
