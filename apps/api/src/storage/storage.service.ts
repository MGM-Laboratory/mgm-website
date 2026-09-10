import { randomUUID } from "node:crypto";

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { Env } from "../config/env.validation.js";

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly bucket?: string;

  constructor(configService: ConfigService<Env, true>) {
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
  }

  private requireBucket(): string {
    if (!this.bucket) {
      throw new Error("AWS_S3_BUCKET is not configured");
    }
    return this.bucket;
  }

  async uploadFile(params: {
    body: Buffer | Uint8Array;
    contentType: string;
    key?: string;
  }): Promise<{ key: string }> {
    const key = params.key ?? randomUUID();

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.requireBucket(),
        Key: key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );

    return { key };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.requireBucket(), Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async deleteFile(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.requireBucket(), Key: key }));
  }
}
