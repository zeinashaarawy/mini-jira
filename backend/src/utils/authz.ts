import type { AuthUser, Task } from "../types/models";
import { HttpError } from "./errors";

export function assertTaskAccess(user: AuthUser, task: Task): void {
  if (user.role === "manager") return;
  if (task.teamId !== user.teamId) {
    throw new HttpError(403, "Forbidden: task belongs to another team");
  }
}

export function assertTeamWrite(user: AuthUser, teamId: string): void {
  if (user.role === "manager") return;
  if (teamId !== user.teamId) {
    throw new HttpError(403, "Forbidden: cannot act outside your team");
  }
}
