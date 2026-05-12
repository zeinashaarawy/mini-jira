import type { S3Event } from "aws-lambda";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import Jimp from "jimp";

const s3 = new S3Client({});

/**
 * Creates a JPEG thumbnail under `tasks/thumbnails/` for each new upload in `tasks/`.
 * S3 versioning (enabled in CDK) retains prior versions for rollback/audit.
 */
export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    if (key.includes("/thumbnails/")) continue;
    if (!key.startsWith("tasks/")) continue;

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await obj.Body?.transformToByteArray();
    if (!body) continue;

    const image = await Jimp.read(Buffer.from(body));
    image.scaleToFit(800, 800);
    const jpeg = await image.getBufferAsync(Jimp.MIME_JPEG);

    const thumbKey = key.replace(/^tasks\//, "tasks/thumbnails/");
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${thumbKey}.jpg`,
        Body: jpeg,
        ContentType: "image/jpeg",
      })
    );
  }
};
