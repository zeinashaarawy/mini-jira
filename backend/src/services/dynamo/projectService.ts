import { GetCommand, PutCommand, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { config } from "../../config/env";
import { docClient } from "./client";
import type { Project } from "../../types/models";

const TABLE = () => config.projectsTable;

function toProject(raw: Record<string, unknown>): Project {
  return {
    projectId: String(raw.projectId),
    title: String(raw.title),
    description: String(raw.description ?? ""),
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
  };
}

export async function listProjects(): Promise<Project[]> {
  const out = await docClient.send(
    new ScanCommand({
      TableName: TABLE(),
      Limit: 200,
    })
  );
  return (out.Items ?? []).map((i) => toProject(i as Record<string, unknown>));
}

export async function createProject(input: {
  title: string;
  description: string;
}): Promise<Project> {
  const now = new Date().toISOString();
  const projectId = uuid();
  const item = {
    projectId,
    title: input.title,
    description: input.description,
    createdAt: now,
    updatedAt: now,
  };
  await docClient.send(
    new PutCommand({
      TableName: TABLE(),
      Item: item,
    })
  );
  return toProject(item);
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  const out = await docClient.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { projectId },
    })
  );
  if (!out.Item) return undefined;
  return toProject(out.Item as Record<string, unknown>);
}
