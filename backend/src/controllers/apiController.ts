import type { Request, Response } from "express";
import { z } from "zod";
import * as taskService from "../services/dynamo/taskService";
import * as projectService from "../services/dynamo/projectService";
import * as commentService from "../services/dynamo/commentService";
import { publishTaskAssigned } from "../services/snsService";
import { putTaskMetric } from "../services/cloudWatchService";
import { getPresignedUploadUrl } from "../services/s3Service";
import { asyncHandler, HttpError } from "../utils/errors";
import { assertTaskAccess, assertTeamWrite } from "../utils/authz";
import {
  createCommentSchema,
  createProjectSchema,
  createTaskSchema,
  presignSchema,
  updateTaskSchema,
} from "../utils/validators";

export const health = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ status: "ok", service: "mini-jira-api" });
});

export const listTasks = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const filterTeamId = req.query.teamId ? String(req.query.teamId) : undefined;
  const assigneeId = req.query.assigneeId ? String(req.query.assigneeId) : undefined;

  if (user.role === "employee" && filterTeamId && filterTeamId !== user.teamId) {
    throw new HttpError(403, "Cannot query another team's tasks");
  }

  const { tasks, lastKey } = await taskService.listTasks({
    role: user.role,
    teamId: user.teamId,
    filterTeamId: user.role === "manager" ? filterTeamId : undefined,
    assigneeId: user.role === "manager" ? assigneeId : undefined,
    limit: req.query.limit ? Number(req.query.limit) : 50,
    exclusiveStartKey: req.query.cursor
      ? (JSON.parse(
          Buffer.from(String(req.query.cursor), "base64url").toString("utf8")
        ) as Record<string, unknown>)
      : undefined,
  });

  res.json({
    tasks,
    nextCursor: lastKey
      ? Buffer.from(JSON.stringify(lastKey), "utf8").toString("base64url")
      : undefined,
  });
});

export const getTask = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const task = await taskService.getTaskById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, task);
  res.json(task);
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const body = createTaskSchema.parse(req.body);
  assertTeamWrite(user, body.teamId);

  const task = await taskService.createTask({
    title: body.title,
    description: body.description ?? "",
    status: body.status,
    priority: body.priority,
    deadline: body.deadline,
    assigneeId: body.assigneeId,
    teamId: body.teamId,
    projectId: body.projectId,
    imageUrls: body.imageUrls,
  });

  if (task.assigneeId) {
    await publishTaskAssigned({
      type: "TASK_ASSIGNED",
      taskId: task.taskId,
      title: task.title,
      assigneeId: task.assigneeId,
      teamId: task.teamId,
      assignedByUserId: user.userId,
      timestamp: new Date().toISOString(),
    });
    await putTaskMetric("TasksAssigned", 1, [
      { Name: "TeamId", Value: task.teamId },
    ]);
  }

  res.status(201).json(task);
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await taskService.getTaskById(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, existing);

  const body = updateTaskSchema.parse(req.body);
  if (body.projectId) {
    const p = await projectService.getProject(body.projectId);
    if (!p) throw new HttpError(400, "Invalid projectId");
  }

  const prevAssignee = existing.assigneeId;
  const task = await taskService.updateTask(req.params.id, body);

  if (task.assigneeId && task.assigneeId !== prevAssignee) {
    await publishTaskAssigned({
      type: "TASK_ASSIGNED",
      taskId: task.taskId,
      title: task.title,
      assigneeId: task.assigneeId,
      teamId: task.teamId,
      assignedByUserId: user.userId,
      timestamp: new Date().toISOString(),
    });
    await putTaskMetric("TasksAssigned", 1, [
      { Name: "TeamId", Value: task.teamId },
    ]);
  }

  res.json(task);
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const existing = await taskService.getTaskById(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, existing);
  await taskService.deleteTask(req.params.id);
  res.status(204).send();
});

export const listProjects = asyncHandler(async (_req: Request, res: Response) => {
  const projects = await projectService.listProjects();
  res.json({ projects });
});

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "manager") throw new HttpError(403, "Managers only");
  const body = createProjectSchema.parse(req.body);
  const project = await projectService.createProject(body);
  res.status(201).json(project);
});

export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const task = await taskService.getTaskById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, task);
  const comments = await commentService.listCommentsForTask(req.params.id);
  res.json({ comments });
});

export const createComment = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const task = await taskService.getTaskById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, task);
  const body = createCommentSchema.parse(req.body);
  const comment = await commentService.addComment({
    taskId: req.params.id,
    userId: user.userId,
    text: body.text,
  });
  res.status(201).json(comment);
});

export const presignUpload = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const task = await taskService.getTaskById(req.params.id);
  if (!task) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, task);
  const q = presignSchema.parse({
    contentType: req.query.contentType,
    extension: req.query.extension,
  });
  const out = await getPresignedUploadUrl({
    taskId: task.taskId,
    contentType: q.contentType,
    extension: q.extension ?? "jpg",
  });
  res.json(out);
});

export const appendTaskImage = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user!;
  const body = z.object({ url: z.string().url() }).parse(req.body);
  const existing = await taskService.getTaskById(req.params.id);
  if (!existing) throw new HttpError(404, "Task not found");
  assertTaskAccess(user, existing);
  const urls = [...existing.imageUrls, body.url];
  const task = await taskService.updateTask(req.params.id, { imageUrls: urls });
  res.json(task);
});
