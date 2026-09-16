import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { CacheService } from "../cache/cache.service.js";
import type { Env } from "../config/env.validation.js";

const IMMUTABLE_MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export class StorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageConfigurationError";
  }
}

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket?: string;
  private readonly localMediaDirectory?: string;

  constructor(
    configService: ConfigService<Env, true>,
    private readonly cache: CacheService,
  ) {
    const accessKeyId = configService.get<string | undefined>("AWS_ACCESS_KEY_ID");
    const secretAccessKey = configService.get<string | undefined>("AWS_SECRET_ACCESS_KEY");

    this.client = new S3Client({
      region: configService.get<string>("AWS_REGION"),
      endpoint: configService.get<string | undefined>("AWS_ENDPOINT_URL"),
      forcePathStyle: configService.get<boolean>("AWS_S3_FORCE_PATH_STYLE"),
      // Falls back to the SDK's default credential provider chain when unset,
      // so real AWS S3 still works via IAM roles / shared config.
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    this.bucket = configService.get<string | undefined>("AWS_S3_BUCKET");
    // Local development should remain fully usable without cloud credentials.
    // Production always has a bucket, while this ignored directory gives the
    // CMS a durable target between local API restarts.
    this.localMediaDirectory = this.bucket
      ? undefined
      : resolve(configService.get<string | undefined>("CMS_LOCAL_MEDIA_DIR") ?? "uploads");
  }

  private requireBucket(): string {
    if (!this.bucket) {
      throw new StorageConfigurationError("AWS_S3_BUCKET is not configured");
    }
    return this.bucket;
  }

  private localPath(key: string) {
    if (!this.localMediaDirectory || basename(key) !== key) {
      throw new Error("Invalid local media key");
    }
    return join(this.localMediaDirectory, key);
  }

  private contentTypeFor(key: string) {
    const ext = key.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "gif":
        return "image/gif";
      case "pdf":
        return "application/pdf";
      case "zip":
        return "application/zip";
      case "doc":
        return "application/msword";
      case "docx":
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "txt":
        return "text/plain";
      default:
        return "application/octet-stream";
    }
  }

  async uploadFile(params: {
    body: Buffer | Uint8Array;
    contentType: string;
    key?: string;
  }): Promise<{ key: string }> {
    const key = params.key ?? randomUUID();

    if (!this.bucket) {
      await mkdir(this.localMediaDirectory!, { recursive: true });
      await writeFile(this.localPath(key), params.body);
      return { key };
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.requireBucket(),
        Key: key,
        Body: params.body,
        CacheControl: IMMUTABLE_MEDIA_CACHE_CONTROL,
        ContentType: params.contentType,
      }),
    );

    return { key };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const cacheKey = `cms:media-url:${key}`;
    const cached = await this.cache.getJson<string>(cacheKey);
    if (cached) return cached;

    const signedUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.requireBucket(), Key: key }),
      { expiresIn: expiresInSeconds },
    );
    await this.cache.setJson(cacheKey, signedUrl, Math.max(1, expiresInSeconds - 60));
    return signedUrl;
  }

  async getLocalFile(key: string): Promise<{ body: Buffer; contentType: string } | undefined> {
    if (this.bucket) return undefined;
    try {
      return { body: await readFile(this.localPath(key)), contentType: this.contentTypeFor(key) };
    } catch {
      return undefined;
    }
  }

  usesLocalMedia() {
    return !this.bucket;
  }

  async deleteFile(key: string): Promise<void> {
    if (!this.bucket) {
      try {
        await unlink(this.localPath(key));
      } catch {
        // A missing local file is already deleted from the CMS's perspective.
      }
      return;
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.requireBucket(), Key: key }));
  }
}
