import { PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { v4 as uuid } from "uuid";
import { config } from "../../config/env";
import { docClient } from "./client";
import type { Comment } from "../../types/models";

const TABLE = () => config.commentsTable;

function toComment(raw: Record<string, unknown>): Comment {
  return {
    commentId: String(raw.commentId),
    taskId: String(raw.taskId),
    userId: String(raw.userId),
    text: String(raw.text),
    createdAt: String(raw.createdAt),
  };
}

export async function listCommentsForTask(taskId: string): Promise<Comment[]> {
  const out = await docClient.send(
    new QueryCommand({
      TableName: TABLE(),
      IndexName: "taskId-index",
      KeyConditionExpression: "taskId = :t",
      ExpressionAttributeValues: { ":t": taskId },
      ScanIndexForward: true,
    })
  );
  return (out.Items ?? []).map((i) => toComment(i as Record<string, unknown>));
}

export async function addComment(input: {
  taskId: string;
  userId: string;
  text: string;
}): Promise<Comment> {
  const now = new Date().toISOString();
  const commentId = uuid();
  const item = {
    commentId,
    taskId: input.taskId,
    userId: input.userId,
    text: input.text,
    createdAt: now,
    taskIdCreatedAt: `${now}#${commentId}`,
  };
  await docClient.send(
    new PutCommand({
      TableName: TABLE(),
      Item: item,
    })
  );
  return toComment(item);
}
