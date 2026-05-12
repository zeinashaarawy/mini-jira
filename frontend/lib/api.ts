import axios from "axios";
import type { Comment, Project, Task, TaskStatus } from "./types";

const baseURL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export const api = axios.create({ baseURL });

export function setAuthToken(token: string | null) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

export async function fetchTasks(params?: {
  teamId?: string;
  assigneeId?: string;
  cursor?: string;
}) {
  const { data } = await api.get<{ tasks: Task[]; nextCursor?: string }>("/tasks", {
    params,
  });
  return data;
}

export async function fetchTask(id: string) {
  const { data } = await api.get<Task>(`/tasks/${id}`);
  return data;
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  const { data } = await api.put<Task>(`/tasks/${id}`, { status });
  return data;
}

export async function updateTask(id: string, patch: Partial<Task>) {
  const { data } = await api.put<Task>(`/tasks/${id}`, patch);
  return data;
}

export async function createTask(body: {
  title: string;
  description?: string;
  priority: Task["priority"];
  teamId: string;
  projectId: string;
  assigneeId?: string;
  deadline?: string;
}) {
  const { data } = await api.post<Task>("/tasks", body);
  return data;
}

export async function deleteTask(id: string) {
  await api.delete(`/tasks/${id}`);
}

export async function fetchProjects() {
  const { data } = await api.get<{ projects: Project[] }>("/projects");
  return data.projects;
}

export async function createProject(body: { title: string; description?: string }) {
  const { data } = await api.post<Project>("/projects", body);
  return data;
}

export async function fetchComments(taskId: string) {
  const { data } = await api.get<{ comments: Comment[] }>(`/tasks/${taskId}/comments`);
  return data.comments;
}

export async function postComment(taskId: string, text: string) {
  const { data } = await api.post<Comment>(`/tasks/${taskId}/comments`, { text });
  return data;
}

export async function getUploadUrl(taskId: string, contentType: string, extension?: string) {
  const { data } = await api.get<{ uploadUrl: string; key: string; publicUrl: string }>(
    `/tasks/${taskId}/upload-url`,
    { params: { contentType, extension } }
  );
  return data;
}

export async function appendTaskImage(taskId: string, url: string) {
  const { data } = await api.post<Task>(`/tasks/${taskId}/images`, { url });
  return data;
}
