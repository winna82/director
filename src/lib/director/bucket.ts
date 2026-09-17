import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type StoredObject = {
  storage: "s3" | "disk" | "db";
  objectKey: string;
  bytes: Buffer;
};

type S3Env = {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function s3Env(): S3Env | null {
  const bucket = process.env.BUCKET?.trim() || process.env.S3_BUCKET?.trim() || "";
  const endpoint = process.env.ENDPOINT?.trim() || process.env.S3_ENDPOINT?.trim() || "";
  const accessKeyId =
    process.env.ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey =
    process.env.SECRET_ACCESS_KEY?.trim() || process.env.AWS_SECRET_ACCESS_KEY?.trim() || "";
  const region =
    process.env.REGION?.trim() ||
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "auto";
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
}

function diskRoot(): string {
  return process.env.MEDIA_DIR?.trim() || join(process.cwd(), ".data", "takes");
}

async function s3Client(env: S3Env) {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: env.region,
    endpoint: env.endpoint || undefined,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

async function putS3(env: S3Env, key: string, body: Buffer, contentType: string) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client(env);
  await client.send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function getS3(env: S3Env, key: string): Promise<Buffer> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client(env);
  const out = await client.send(new GetObjectCommand({ Bucket: env.bucket, Key: key }));
  const bytes = await out.Body?.transformToByteArray();
  if (!bytes) throw new Error("Empty object");
  return Buffer.from(bytes);
}

export async function putMedia(key: string, body: Buffer, contentType: string): Promise<"s3" | "disk"> {
  const env = s3Env();
  if (env) {
    await putS3(env, key, body, contentType);
    return "s3";
  }
  const root = diskRoot();
  await mkdir(root, { recursive: true });
  await writeFile(join(root, key.replaceAll("/", "_")), body);
  return "disk";
}

export async function getMedia(storage: string, key: string): Promise<Buffer | null> {
  if (storage === "s3") {
    const env = s3Env();
    if (!env) return null;
    try {
      return await getS3(env, key);
    } catch {
      return null;
    }
  }
  if (storage === "disk") {
    try {
      return await readFile(join(diskRoot(), key.replaceAll("/", "_")));
    } catch {
      return null;
    }
  }
  return null;
}

/** Remove a stored take. Already-missing objects count as removed. */
export async function deleteMedia(storage: string, key: string): Promise<void> {
  if (storage === "s3") {
    const env = s3Env();
    if (!env) throw new Error("The bucket is not configured.");
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const client = await s3Client(env);
    await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }));
    return;
  }
  if (storage === "disk") {
    await rm(join(diskRoot(), key.replaceAll("/", "_")), { force: true });
  }
}

export function bucketReady(): boolean {
  return s3Env() !== null;
}
