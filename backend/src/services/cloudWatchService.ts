import {
  CloudWatchClient,
  PutMetricDataCommand,
} from "@aws-sdk/client-cloudwatch";
import { config } from "../config/env";

const client = new CloudWatchClient({ region: config.awsRegion });

export async function putTaskMetric(
  metricName: string,
  value: number,
  dimensions?: { Name: string; Value: string }[]
): Promise<void> {
  await client.send(
    new PutMetricDataCommand({
      Namespace: config.cloudWatchNamespace,
      MetricData: [
        {
          MetricName: metricName,
          Value: value,
          Unit: "Count",
          Timestamp: new Date(),
          Dimensions: dimensions,
        },
      ],
    })
  );
}
