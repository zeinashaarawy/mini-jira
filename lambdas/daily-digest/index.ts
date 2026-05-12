import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));

/**
 * Scheduled once per day (EventBridge). Scans tasks to find overdue items.
 * Scan is acceptable here: low frequency, operational reporting path (not hot read path).
 */
export const handler = async (): Promise<void> => {
  const table = process.env.TASKS_TABLE;
  const topic = process.env.SNS_TOPIC_ARN;
  if (!table) throw new Error("TASKS_TABLE missing");

  const now = Date.now();
  const out = await doc.send(new ScanCommand({ TableName: table, Limit: 500 }));
  const items = out.Items ?? [];

  const overdue = items.filter((t) => {
    const deadline = t.deadline ? Date.parse(String(t.deadline)) : NaN;
    const status = String(t.status);
    return Number.isFinite(deadline) && deadline < now && status !== "done";
  });

  const cw = new CloudWatchClient({});
  await cw.send(
    new PutMetricDataCommand({
      Namespace: process.env.CW_NAMESPACE ?? "MiniJira",
      MetricData: [
        {
          MetricName: "OverdueTasks",
          Value: overdue.length,
          Unit: "Count",
          Timestamp: new Date(),
        },
      ],
    })
  );

  const message = {
    type: "DAILY_DIGEST",
    generatedAt: new Date().toISOString(),
    overdueCount: overdue.length,
    sample: overdue.slice(0, 10).map((t) => ({
      taskId: t.taskId,
      title: t.title,
      teamId: t.teamId,
      deadline: t.deadline,
    })),
  };

  if (topic) {
    const sns = new SNSClient({});
    await sns.send(
      new PublishCommand({
        TopicArn: topic,
        Subject: `Mini Jira daily digest — ${overdue.length} overdue tasks`,
        Message: JSON.stringify(message, null, 2),
      })
    );
  }

  console.log(JSON.stringify(message));
};
