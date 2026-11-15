import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CacheService } from "./cache.service.js";

const fake = vi.hoisted(() => ({ instances: [] as unknown[], options: [] as unknown[] }));

vi.mock("ioredis", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class FakeRedis extends Emitter {
    status = "ready";
    connect = vi.fn(async () => {
      this.status = "ready";
    });
    get = vi.fn(async (): Promise<string | null> => null);
    set = vi.fn(async () => "OK");
    del = vi.fn(async () => 1);
    quit = vi.fn(async () => "OK");
    disconnect = vi.fn();
    constructor(
      readonly url: string,
      options: unknown,
    ) {
      super();
      fake.instances.push(this);
      fake.options.push(options);
    }
  }
  return { Redis: FakeRedis };
});

type FakeRedisInstance = EventEmitter & {
  status: string;
  connect: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  url: string;
};

function make(url: string | null = "redis://cache:6379") {
  const service = new CacheService({ get: () => url ?? undefined } as never);
  const redis = fake.instances.at(-1) as FakeRedisInstance | undefined;
  return { redis: url ? (redis as FakeRedisInstance) : undefined, service };
}

beforeEach(() => {
  fake.instances.length = 0;
  fake.options.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CacheService without Redis", () => {
  it("does not connect and answers every call as a miss", async () => {
    const { service } = make(null);
    expect(fake.instances).toHaveLength(0);
    expect(await service.getJson("k")).toBeUndefined();
    await expect(service.setJson("k", 1, 10)).resolves.toBeUndefined();
    await expect(service.remove("k")).resolves.toBeUndefined();
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});

describe("CacheService with Redis", () => {
  it("connects lazily with short limits and ignores client errors", () => {
    const { redis } = make();
    expect(fake.options[0]).toMatchObject({
      connectTimeout: 750,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    const retry = (fake.options[0] as { retryStrategy: (attempt: number) => number }).retryStrategy;
    expect(retry(1)).toBe(150);
    expect(retry(10)).toBe(750);
    expect(() => redis?.emit("error", new Error("boom"))).not.toThrow();
  });

  it("reads and parses a stored value", async () => {
    const { redis, service } = make();
    redis?.get.mockResolvedValue('{"a":1}');
    expect(await service.getJson("k")).toEqual({ a: 1 });
    expect(redis?.get).toHaveBeenCalledWith("k");
  });

  it("answers a miss for an empty value", async () => {
    const { service } = make();
    expect(await service.getJson("k")).toBeUndefined();
  });

  it("treats a corrupt value as unavailable and backs off", async () => {
    const { redis, service } = make();
    redis?.get.mockResolvedValue("{not json");
    expect(await service.getJson("k")).toBeUndefined();
    redis?.get.mockClear();
    expect(await service.getJson("k")).toBeUndefined();
    expect(redis?.get).not.toHaveBeenCalled();
  });

  it("stores a value with an expiry", async () => {
    const { redis, service } = make();
    await service.setJson("k", { b: 2 }, 60);
    expect(redis?.set).toHaveBeenCalledWith("k", '{"b":2}', "EX", 60);
  });

  it("backs off after a failed write and resumes after thirty seconds", async () => {
    vi.useFakeTimers();
    const { redis, service } = make();
    redis?.set.mockRejectedValueOnce(new Error("down"));
    await service.setJson("k", 1, 10);
    redis?.set.mockClear();
    await service.setJson("k", 1, 10);
    expect(redis?.set).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 30_001);
    await service.setJson("k", 1, 10);
    expect(redis?.set).toHaveBeenCalledTimes(1);
  });

  it("removes keys in one call and skips an empty list", async () => {
    const { redis, service } = make();
    await service.remove();
    expect(redis?.del).not.toHaveBeenCalled();
    await service.remove("a", "b");
    expect(redis?.del).toHaveBeenCalledWith("a", "b");
  });

  it("backs off after a failed delete", async () => {
    const { redis, service } = make();
    redis?.del.mockRejectedValueOnce(new Error("down"));
    await service.remove("a");
    redis?.get.mockClear();
    await service.getJson("k");
    expect(redis?.get).not.toHaveBeenCalled();
  });

  it("gives up on a call that does not answer in time", async () => {
    vi.useFakeTimers();
    const { redis, service } = make();
    redis?.get.mockReturnValue(new Promise(() => undefined));
    const pending = service.getJson("k");
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBeUndefined();
  });

  it("opens a connection that was not started yet", async () => {
    const { redis, service } = make();
    if (redis) redis.status = "wait";
    redis?.get.mockResolvedValue("1");
    expect(await service.getJson("k")).toBe(1);
    expect(redis?.connect).toHaveBeenCalledTimes(1);
  });

  it("backs off when the connection cannot be opened", async () => {
    const { redis, service } = make();
    if (redis) redis.status = "wait";
    redis?.connect.mockRejectedValue(new Error("refused"));
    expect(await service.getJson("k")).toBeUndefined();
    expect(redis?.get).not.toHaveBeenCalled();
  });

  it("waits for a connection that is already opening", async () => {
    const { redis, service } = make();
    if (redis) redis.status = "connecting";
    redis?.get.mockResolvedValue("2");
    const pending = service.getJson("k");
    await Promise.resolve();
    redis?.emit("ready");
    expect(await pending).toBe(2);
  });

  it("backs off when a connection that is opening fails", async () => {
    const { redis, service } = make();
    if (redis) redis.status = "connecting";
    const pending = service.getJson("k");
    await Promise.resolve();
    redis?.emit("error", new Error("refused"));
    expect(await pending).toBeUndefined();
  });

  it("times out a connection that never becomes ready", async () => {
    vi.useFakeTimers();
    const { redis, service } = make();
    if (redis) redis.status = "connecting";
    const pending = service.getJson("k");
    await vi.advanceTimersByTimeAsync(800);
    expect(await pending).toBeUndefined();
  });

  it("closes the connection on shutdown and falls back to a hard disconnect", async () => {
    const first = make();
    await first.service.onModuleDestroy();
    expect(first.redis?.quit).toHaveBeenCalledTimes(1);
    expect(first.redis?.disconnect).not.toHaveBeenCalled();

    const second = make();
    second.redis?.quit.mockRejectedValue(new Error("closed"));
    await second.service.onModuleDestroy();
    expect(second.redis?.disconnect).toHaveBeenCalledTimes(1);
  });
});
