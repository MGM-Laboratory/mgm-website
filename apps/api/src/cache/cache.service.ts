import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import type { Env } from "../config/env.validation.js";

const FAILURE_BACKOFF_MS = 30_000;
const CONNECT_TIMEOUT_MS = 750;

function within<T>(promise: Promise<T>, timeout: number) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error("Cache operation timed out")), timeout);
    }),
  ]);
}

/** Redis accelerates reads; it is never required to serve the site. */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis?: Redis;
  private unavailableUntil = 0;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get<string | undefined>("REDIS_URL");
    if (!url) return;

    this.redis = new Redis(url, {
      connectTimeout: CONNECT_TIMEOUT_MS,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 150, 750),
    });
    this.redis.on("error", () => undefined);
  }

  async getJson<T>(key: string): Promise<T | undefined> {
    const redis = await this.connected();
    if (!redis) return undefined;
    try {
      const value = await within(redis.get(key), CONNECT_TIMEOUT_MS);
      return value ? (JSON.parse(value) as T) : undefined;
    } catch {
      this.markUnavailable();
      return undefined;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const redis = await this.connected();
    if (!redis) return;
    try {
      await within(redis.set(key, JSON.stringify(value), "EX", ttlSeconds), CONNECT_TIMEOUT_MS);
    } catch {
      this.markUnavailable();
    }
  }

  async remove(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    const redis = await this.connected();
    if (!redis) return;
    try {
      await within(redis.del(...keys), CONNECT_TIMEOUT_MS);
    } catch {
      this.markUnavailable();
    }
  }

  async onModuleDestroy() {
    if (this.redis) await this.redis.quit().catch(() => this.redis?.disconnect());
  }

  private async connected(): Promise<Redis | undefined> {
    if (!this.redis || Date.now() < this.unavailableUntil) return undefined;
    if (this.redis.status === "ready") return this.redis;

    try {
      if (this.redis.status === "wait") {
        await within(this.redis.connect(), CONNECT_TIMEOUT_MS);
      } else if (this.redis.status === "connecting") {
        await within(
          new Promise<void>((resolve, reject) => {
            this.redis?.once("ready", resolve);
            this.redis?.once("error", reject);
          }),
          CONNECT_TIMEOUT_MS,
        );
      }
      return this.redis;
    } catch {
      this.markUnavailable();
      return undefined;
    }
  }

  private markUnavailable() {
    this.unavailableUntil = Date.now() + FAILURE_BACKOFF_MS;
  }
}
