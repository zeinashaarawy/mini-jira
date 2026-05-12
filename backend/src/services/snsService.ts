import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { config } from "../config/env";

const client = new SNSClient({ region: config.awsRegion });

export interface TaskAssignedEvent {
  type: "TASK_ASSIGNED";
  taskId: string;
  title: string;
  assigneeId: string;
  teamId: string;
  assignedByUserId: string;
  timestamp: string;
}

export async function publishTaskAssigned(event: TaskAssignedEvent): Promise<void> {
  if (!config.snsTopicArn) {
    console.warn("SNS_TOPIC_ARN not set; skipping publish");
    return;
  }
  await client.send(
    new PublishCommand({
      TopicArn: config.snsTopicArn,
      Message: JSON.stringify(event),
      Subject: `Task assigned: ${event.title}`,
      MessageAttributes: {
        eventType: {
          DataType: "String",
          StringValue: event.type,
        },
        teamId: {
          DataType: "String",
          StringValue: event.teamId,
        },
      },
    })
  );
}
