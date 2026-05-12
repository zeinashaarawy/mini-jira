import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuid } from "uuid";
import { config } from "../config/env";
import { HttpError } from "../utils/errors";

const client = new S3Client({ region: config.awsRegion });

export async function getPresignedUploadUrl(options: {
  taskId: string;
  contentType: string;
  extension: string;
}): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  if (!config.s3Bucket) throw new HttpError(500, "S3 not configured");

  const safeExt = options.extension.replace(/[^a-zA-Z0-9.]/g, "") || "bin";
  const key = `tasks/${options.taskId}/${uuid()}.${safeExt}`;

  const cmd = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: options.contentType,
  });

  const uploadUrl = await getSignedUrl(client, cmd, { expiresIn: 900 });
  const region = config.awsRegion;
  const publicUrl = `https://${config.s3Bucket}.s3.${region}.amazonaws.com/${key}`;

  return { uploadUrl, key, publicUrl };
}
