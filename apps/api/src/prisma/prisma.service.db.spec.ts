import { afterAll, describe, expect, it } from "vitest";

import { PrismaService } from "./prisma.service.js";

const databaseUrl = process.env.DATABASE_URL;

function connect() {
  const config = { getOrThrow: () => databaseUrl };
  return new PrismaService(config as never);
}

// This runs only where a PostgreSQL database is set up for the tests, as in
// CI. A start on an empty database, a second start and two starts at once must
// all end with the tables in place.
describe.skipIf(!databaseUrl)("boot DDL on PostgreSQL", () => {
  const services: PrismaService[] = [];
  const open = () => {
    const service = connect();
    services.push(service);
    return service;
  };

  afterAll(async () => {
    await Promise.all(services.map((service) => service.$disconnect()));
  });

  it("creates the tables, then does nothing on a second start", async () => {
    const service = open();
    await service.onModuleInit();
    await service.onModuleInit();
    const rows = await service.$queryRaw<{ name: string }[]>`
      SELECT tablename AS name FROM pg_tables
      WHERE schemaname = current_schema() AND tablename IN ('FormMedia', 'MailOutbox', 'CmsMember')`;
    expect(rows.map((row) => row.name).sort()).toEqual(["CmsMember", "FormMedia", "MailOutbox"]);
  });

  it("lets two copies start at the same time", async () => {
    const first = open();
    const second = open();
    await expect(Promise.all([first.onModuleInit(), second.onModuleInit()])).resolves.toBeDefined();
  });
});
