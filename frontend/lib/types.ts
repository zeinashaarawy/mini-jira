export type UserRole = "manager" | "employee";

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface Task {
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline?: string;
  assigneeId?: string;
  teamId: string;
  projectId: string;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  projectId: string;
  title: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  commentId: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: string;
}

export interface AuthSession {
  idToken: string;
  email: string;
  role: UserRole;
  teamId: string;
  userId: string;
}
