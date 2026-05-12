import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class MiniJiraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tasks = new dynamodb.Table(this, "Tasks", {
      partitionKey: { name: "taskId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });
    tasks.addGlobalSecondaryIndex({
      indexName: "teamId-index",
      partitionKey: { name: "teamId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "teamIdUpdatedAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    tasks.addGlobalSecondaryIndex({
      indexName: "assigneeId-index",
      partitionKey: { name: "assigneeId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "assigneeIdUpdatedAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const comments = new dynamodb.Table(this, "Comments", {
      partitionKey: { name: "commentId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    comments.addGlobalSecondaryIndex({
      indexName: "taskId-index",
      partitionKey: { name: "taskId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "taskIdCreatedAt", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const projects = new dynamodb.Table(this, "Projects", {
      partitionKey: { name: "projectId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const users = new dynamodb.Table(this, "Users", {
      partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const images = new s3.Bucket(this, "TaskImages", {
      versioned: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
    });

    const taskTopic = new sns.Topic(this, "TaskEvents", {
      displayName: "Mini Jira task assignment events",
    });

    const assignmentQueue = new sqs.Queue(this, "AssignmentQueue", {
      visibilityTimeout: cdk.Duration.seconds(60),
    });
    taskTopic.addSubscription(
      new subs.SqsSubscription(assignmentQueue, { rawMessageDelivery: true })
    );

    const cwNamespace = "MiniJira";

    const resizeFn = new NodejsFunction(this, "ImageResizeFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../../lambdas/image-resize/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 1024,
      environment: {},
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node20",
      },
    });
    images.grantReadWrite(resizeFn);
    images.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(resizeFn),
      { prefix: "tasks/" }
    );

    const workerFn = new NodejsFunction(this, "AssignmentWorkerFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../../lambdas/sqs-worker/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: { CW_NAMESPACE: cwNamespace },
      bundling: { minify: true, sourceMap: true, target: "node20" },
    });
    workerFn.addEventSource(new SqsEventSource(assignmentQueue, { batchSize: 5 }));
    workerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );

    const digestFn = new NodejsFunction(this, "DailyDigestFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "../../../lambdas/daily-digest/index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(60),
      environment: {
        TASKS_TABLE: tasks.tableName,
        SNS_TOPIC_ARN: taskTopic.topicArn,
        CW_NAMESPACE: cwNamespace,
      },
      bundling: { minify: true, sourceMap: true, target: "node20" },
    });
    tasks.grantReadData(digestFn);
    taskTopic.grantPublish(digestFn);
    digestFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cloudwatch:PutMetricData"],
        resources: ["*"],
      })
    );

    new events.Rule(this, "DailyDigestSchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "9", weekDay: "*", month: "*", year: "*" }),
      description: "Daily digest at 09:00 UTC (adjust to your org timezone as needed)",
    }).addTarget(new targets.LambdaFunction(digestFn));

    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { username: true, email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      customAttributes: {
        role: new cognito.StringAttribute({ minLen: 1, maxLen: 16, mutable: true }),
        teamId: new cognito.StringAttribute({ minLen: 1, maxLen: 64, mutable: true }),
      },
      passwordPolicy: { minLength: 8 },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("WebClient", {
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const dashboard = new cloudwatch.Dashboard(this, "MiniJiraDashboard", {
      dashboardName: "MiniJira",
    });
    dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: "Task assignment activity",
        left: [
          new cloudwatch.Metric({
            namespace: cwNamespace,
            metricName: "TasksAssigned",
            statistic: "Sum",
            period: cdk.Duration.hours(1),
          }),
          new cloudwatch.Metric({
            namespace: cwNamespace,
            metricName: "AssignmentEventsProcessed",
            statistic: "Sum",
            period: cdk.Duration.hours(1),
          }),
        ],
      }),
      new cloudwatch.GraphWidget({
        title: "Overdue tasks (daily digest)",
        left: [
          new cloudwatch.Metric({
            namespace: cwNamespace,
            metricName: "OverdueTasks",
            statistic: "Maximum",
            period: cdk.Duration.days(1),
          }),
        ],
      })
    );

    new cloudwatch.Alarm(this, "OverdueTasksAlarm", {
      metric: new cloudwatch.Metric({
        namespace: cwNamespace,
        metricName: "OverdueTasks",
        statistic: "Maximum",
        period: cdk.Duration.days(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription: "Fires when the daily digest reports one or more overdue tasks",
    });

    new cdk.CfnOutput(this, "TasksTableName", { value: tasks.tableName });
    new cdk.CfnOutput(this, "CommentsTableName", { value: comments.tableName });
    new cdk.CfnOutput(this, "ProjectsTableName", { value: projects.tableName });
    new cdk.CfnOutput(this, "UsersTableName", { value: users.tableName });
    new cdk.CfnOutput(this, "ImagesBucketName", { value: images.bucketName });
    new cdk.CfnOutput(this, "TaskTopicArn", { value: taskTopic.topicArn });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
  }
}
