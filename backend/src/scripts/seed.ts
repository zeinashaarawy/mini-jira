/**
 * Loads sample users, projects, and tasks into DynamoDB.
 * Run from backend/: `npm run seed` with AWS credentials configured.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../config/env";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.awsRegion }), {
  marshallOptions: { removeUndefinedValues: true },
});

const TEAM_A = "team-alpha";
const TEAM_B = "team-beta";
const now = new Date().toISOString();

const users = [
  {
    userId: "mgr-1",
    name: "Alex Manager",
    email: "alex.manager@example.com",
    role: "manager",
    teamId: "management",
    createdAt: now,
    updatedAt: now,
  },
  {
    userId: "emp-a-1",
    name: "Jamie Alpha",
    email: "jamie.alpha@example.com",
    role: "employee",
    teamId: TEAM_A,
    createdAt: now,
    updatedAt: now,
  },
  {
    userId: "emp-b-1",
    name: "Riley Beta",
    email: "riley.beta@example.com",
    role: "employee",
    teamId: TEAM_B,
    createdAt: now,
    updatedAt: now,
  },
];

const projects = [
  {
    projectId: "proj-cloud-101",
    title: "Cloud Foundations",
    description: "Sprint work for the cloud course project.",
    createdAt: now,
    updatedAt: now,
  },
];

function gsiSk(updatedAt: string, taskId: string) {
  return `${updatedAt}#${taskId}`;
}

const tasks = [
  {
    taskId: "task-seed-1",
    title: "Wire Cognito JWT middleware",
    description: "Verify ID tokens and map custom claims to req.user.",
    status: "done",
    priority: "high",
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    assigneeId: "emp-a-1",
    teamId: TEAM_A,
    projectId: "proj-cloud-101",
    imageUrls: [] as string[],
    createdAt: now,
    updatedAt: now,
    teamIdUpdatedAt: gsiSk(now, "task-seed-1"),
    assigneeIdUpdatedAt: gsiSk(now, "task-seed-1"),
  },
  {
    taskId: "task-seed-2",
    title: "Kanban drag-and-drop",
    description: "dnd-kit columns for todo → in progress → in review → done.",
    status: "in_progress",
    priority: "medium",
    assigneeId: "emp-a-1",
    teamId: TEAM_A,
    projectId: "proj-cloud-101",
    imageUrls: [],
    createdAt: now,
    updatedAt: now,
    teamIdUpdatedAt: gsiSk(now, "task-seed-2"),
    assigneeIdUpdatedAt: gsiSk(now, "task-seed-2"),
  },
  {
    taskId: "task-seed-3",
    title: "SNS fan-out for assignments",
    description: "Publish assignment events; SQS + email subscriptions.",
    status: "todo",
    priority: "urgent",
    assigneeId: "emp-b-1",
    teamId: TEAM_B,
    projectId: "proj-cloud-101",
    imageUrls: [],
    createdAt: now,
    updatedAt: now,
    teamIdUpdatedAt: gsiSk(now, "task-seed-3"),
    assigneeIdUpdatedAt: gsiSk(now, "task-seed-3"),
  },
];

const comments = [
  {
    commentId: "cmt-seed-1",
    taskId: "task-seed-1",
    userId: "mgr-1",
    text: "Nice work — JWT middleware looks clean.",
    createdAt: now,
    taskIdCreatedAt: `${now}#cmt-seed-1`,
  },
];

async function main() {
  for (const u of users) {
    await doc.send(new PutCommand({ TableName: config.usersTable, Item: u }));
  }
  for (const p of projects) {
    await doc.send(new PutCommand({ TableName: config.projectsTable, Item: p }));
  }
  for (const t of tasks) {
    await doc.send(new PutCommand({ TableName: config.tasksTable, Item: t }));
  }
  for (const c of comments) {
    await doc.send(new PutCommand({ TableName: config.commentsTable, Item: c }));
  }
  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
