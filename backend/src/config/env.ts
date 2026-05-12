import dotenv from "dotenv";

dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
  cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID ?? "",
  cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "",
  cognitoIssuer:
    process.env.COGNITO_ISSUER ??
    (process.env.COGNITO_USER_POOL_ID
      ? `https://cognito-idp.${process.env.AWS_REGION ?? "us-east-1"}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
      : ""),
  tasksTable: process.env.TASKS_TABLE ?? "MiniJiraTasks",
  projectsTable: process.env.PROJECTS_TABLE ?? "MiniJiraProjects",
  commentsTable: process.env.COMMENTS_TABLE ?? "MiniJiraComments",
  usersTable: process.env.USERS_TABLE ?? "MiniJiraUsers",
  s3Bucket: process.env.S3_BUCKET ?? "",
  snsTopicArn: process.env.SNS_TOPIC_ARN ?? "",
  cloudWatchNamespace: process.env.CLOUDWATCH_NAMESPACE ?? "MiniJira",
};

/** Throws at runtime if critical vars are missing (call from index after dotenv). */
export function assertProductionConfig(): void {
  if (config.nodeEnv !== "production") return;
  required("COGNITO_USER_POOL_ID");
  required("COGNITO_CLIENT_ID");
  required("TASKS_TABLE");
  required("PROJECTS_TABLE");
  required("COMMENTS_TABLE");
  required("USERS_TABLE");
}
