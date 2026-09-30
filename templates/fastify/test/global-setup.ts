import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let mongoServer: MongoMemoryServer;

export async function setup(project: TestProject): Promise<void> {
  mongoServer = await MongoMemoryServer.create();
  project.provide("mongoUri", mongoServer.getUri());
}

export async function teardown(): Promise<void> {
  await mongoServer?.stop();
}
