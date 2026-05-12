import { z } from "zod";
import type { TaskPriority, TaskStatus } from "../types/models";

export const taskStatusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);
export const taskPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const createTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().default(""),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema,
  deadline: z.string().optional(),
  assigneeId: z.string().min(1).optional(),
  teamId: z.string().min(1),
  projectId: z.string().min(1),
  imageUrls: z.array(z.string().url()).optional(),
});

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(8000).optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    deadline: z.string().nullable().optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    projectId: z.string().min(1).optional(),
    imageUrls: z.array(z.string().url()).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "Empty patch" });

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(8000).optional().default(""),
});

export const createCommentSchema = z.object({
  text: z.string().min(1).max(4000),
});

export const presignSchema = z.object({
  contentType: z.string().min(3).max(128),
  extension: z.string().max(16).optional().default("jpg"),
});
