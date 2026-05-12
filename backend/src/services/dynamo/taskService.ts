import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { config } from "../../config/env";
import { docClient } from "./client";
import type { Task, TaskPriority, TaskStatus } from "../../types/models";
import { HttpError } from "../../utils/errors";

const TABLE = () => config.tasksTable;

/** Composite sort key for GSIs — keeps stable ordering by recency */
function gsiSk(updatedAt: string, taskId: string): string {
  return `${updatedAt}#${taskId}`;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  status?: TaskStatus;
  priority: TaskPriority;
  deadline?: string;
  assigneeId?: string;
  teamId: string;
  projectId: string;
  imageUrls?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: string | null;
  assigneeId?: string | null;
  projectId?: string;
  imageUrls?: string[];
}

function toTask(raw: Record<string, unknown>): Task {
  return {
    taskId: String(raw.taskId),
    title: String(raw.title),
    description: String(raw.description ?? ""),
    status: raw.status as Task["status"],
    priority: raw.priority as Task["priority"],
    deadline: raw.deadline ? String(raw.deadline) : undefined,
    assigneeId: raw.assigneeId ? String(raw.assigneeId) : undefined,
    teamId: String(raw.teamId),
    projectId: String(raw.projectId),
    imageUrls: Array.isArray(raw.imageUrls) ? (raw.imageUrls as string[]) : [],
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
  };
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const now = new Date().toISOString();
  const taskId = uuid();
  const status = input.status ?? "todo";
  const item = {
    taskId,
    title: input.title,
    description: input.description,
    status,
    priority: input.priority,
    deadline: input.deadline,
    assigneeId: input.assigneeId,
    teamId: input.teamId,
    projectId: input.projectId,
    imageUrls: input.imageUrls ?? [],
    createdAt: now,
    updatedAt: now,
    // GSI sort keys (duplicated attributes for clarity in items)
    teamIdUpdatedAt: gsiSk(now, taskId),
    assigneeIdUpdatedAt: input.assigneeId
      ? gsiSk(now, taskId)
      : undefined,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE(),
      Item: item,
      ConditionExpression: "attribute_not_exists(taskId)",
    })
  );

  return toTask(item);
}

export async function getTaskById(taskId: string): Promise<Task | undefined> {
  const out = await docClient.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { taskId },
    })
  );
  if (!out.Item) return undefined;
  return toTask(out.Item as Record<string, unknown>);
}

/** Employees: always scoped to their teamId. Managers: optional teamId filter, else Scan (see README). */
export async function listTasks(options: {
  role: "manager" | "employee";
  teamId: string;
  filterTeamId?: string;
  assigneeId?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
}): Promise<{ tasks: Task[]; lastKey?: Record<string, unknown> }> {
  const limit = Math.min(options.limit ?? 50, 100);

  if (options.role === "employee") {
    const out = await docClient.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: "teamId-index",
        KeyConditionExpression: "teamId = :t",
        ExpressionAttributeValues: { ":t": options.teamId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: options.exclusiveStartKey,
      })
    );
    const tasks = (out.Items ?? []).map((i) => toTask(i as Record<string, unknown>));
    return { tasks, lastKey: out.LastEvaluatedKey };
  }

  // Manager + assignee filter → Query assigneeId-index
  if (options.assigneeId) {
    const out = await docClient.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: "assigneeId-index",
        KeyConditionExpression: "assigneeId = :a",
        ExpressionAttributeValues: { ":a": options.assigneeId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: options.exclusiveStartKey,
      })
    );
    const tasks = (out.Items ?? []).map((i) => toTask(i as Record<string, unknown>));
    return { tasks, lastKey: out.LastEvaluatedKey };
  }

  // Manager + explicit team filter → Query teamId-index (preferred over Scan).
  if (options.filterTeamId) {
    const out = await docClient.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: "teamId-index",
        KeyConditionExpression: "teamId = :t",
        ExpressionAttributeValues: { ":t": options.filterTeamId },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: options.exclusiveStartKey,
      })
    );
    const tasks = (out.Items ?? []).map((i) => toTask(i as Record<string, unknown>));
    return { tasks, lastKey: out.LastEvaluatedKey };
  }

  // Manager listing all teams: Scan is the fallback when only teamId/assignee GSIs exist.
  const out = await docClient.send(
    new ScanCommand({
      TableName: TABLE(),
      Limit: limit,
      ExclusiveStartKey: options.exclusiveStartKey,
    })
  );
  const tasks = (out.Items ?? []).map((i) => toTask(i as Record<string, unknown>));
  return { tasks, lastKey: out.LastEvaluatedKey };
}

export async function updateTask(
  taskId: string,
  patch: UpdateTaskInput
): Promise<Task> {
  const existing = await getTaskById(taskId);
  if (!existing) throw new HttpError(404, "Task not found");

  const now = new Date().toISOString();
  const next: Task = {
    ...existing,
    title: patch.title ?? existing.title,
    description: patch.description ?? existing.description,
    status: patch.status ?? existing.status,
    priority: patch.priority ?? existing.priority,
    deadline:
      patch.deadline === null
        ? undefined
        : patch.deadline !== undefined
          ? patch.deadline ?? existing.deadline
          : existing.deadline,
    assigneeId:
      patch.assigneeId === null
        ? undefined
        : patch.assigneeId !== undefined
          ? patch.assigneeId ?? existing.assigneeId
          : existing.assigneeId,
    projectId: patch.projectId ?? existing.projectId,
    imageUrls: patch.imageUrls ?? existing.imageUrls,
    updatedAt: now,
  };

  await docClient.send(
    new PutCommand({
      TableName: TABLE(),
      Item: {
        ...next,
        teamIdUpdatedAt: gsiSk(now, taskId),
        assigneeIdUpdatedAt: next.assigneeId
          ? gsiSk(now, taskId)
          : undefined,
      },
    })
  );

  return next;
}

export async function deleteTask(taskId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: TABLE(),
      Key: { taskId },
      ConditionExpression: "attribute_exists(taskId)",
    })
  );
}
