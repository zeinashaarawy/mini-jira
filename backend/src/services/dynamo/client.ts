import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "../../config/env";

const lowLevel = new DynamoDBClient({
  region: config.awsRegion,
});

export const docClient = DynamoDBDocumentClient.from(lowLevel, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
