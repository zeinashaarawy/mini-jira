import type { SQSEvent } from "aws-lambda";
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const cw = new CloudWatchClient({});

/**
 * Processes SNS-wrapped SQS messages from task assignment fan-out.
 * Logs structured activity and emits a custom CloudWatch metric for dashboards/alarms.
 */
export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let payload: unknown = record.body;
    try {
      payload = JSON.parse(record.body);
    } catch {
      // non-JSON body
    }
    console.log(
      JSON.stringify({
        level: "INFO",
        source: "MiniJiraSqsWorker",
        message: "Processed assignment event",
        payload,
        messageId: record.messageId,
      })
    );

    await cw.send(
      new PutMetricDataCommand({
        Namespace: process.env.CW_NAMESPACE ?? "MiniJira",
        MetricData: [
          {
            MetricName: "AssignmentEventsProcessed",
            Value: 1,
            Unit: "Count",
            Timestamp: new Date(),
          },
        ],
      })
    );
  }
};
