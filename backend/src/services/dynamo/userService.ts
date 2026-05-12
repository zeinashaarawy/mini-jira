import { GetCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "../../config/env";
import { docClient } from "./client";
import type { UserProfile, UserRole } from "../../types/models";

const TABLE = () => config.usersTable;

function toUser(raw: Record<string, unknown>): UserProfile {
  return {
    userId: String(raw.userId),
    name: String(raw.name),
    email: String(raw.email),
    role: raw.role as UserRole,
    teamId: String(raw.teamId),
    createdAt: String(raw.createdAt),
    updatedAt: String(raw.updatedAt),
  };
}

export async function getUser(userId: string): Promise<UserProfile | undefined> {
  const out = await docClient.send(
    new GetCommand({
      TableName: TABLE(),
      Key: { userId },
    })
  );
  if (!out.Item) return undefined;
  return toUser(out.Item as Record<string, unknown>);
}

export async function listUsers(): Promise<UserProfile[]> {
  const out = await docClient.send(
    new ScanCommand({
      TableName: TABLE(),
      Limit: 500,
    })
  );
  return (out.Items ?? []).map((i) => toUser(i as Record<string, unknown>));
}
