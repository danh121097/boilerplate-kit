/**
 * Vitest globalSetup — runs ONCE before ALL test workers start, in the main
 * process. This is the correct place to start MongoMemoryServer because:
 *   1. It runs before any worker imports test files or setupFiles.
 *   2. The URI is handed to workers through vitest's `provide`/`inject`, which is
 *      scoped to this run; setupFiles reads it synchronously and sets
 *      process.env.MONGODB_URI before any NestJS module constructs. (A fixed temp
 *      file would be shared by concurrent `pnpm test` runs, which would then use one
 *      mongod and delete each other's URI file on teardown.)
 *
 * MongoMemoryServer binary: ~100 MB download on first run. CI should pre-warm:
 *   MONGOMS_VERSION=7.0.14 node -e "require('mongodb-memory-server').MongoMemoryServer.create().then(s=>s.stop())"
 * Or point MONGOMS_SYSTEM_BINARY to an existing mongod binary.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

let mongoServer: MongoMemoryServer;

export async function setup(project: TestProject): Promise<void> {
  process.env.MONGOMS_VERSION = "7.0.14";
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  // Per-run URI delivered to every worker before any module imports.
  project.provide("mongoUri", uri);
  // Also set it in the main process env (for coverage of non-worker contexts).
  process.env.MONGODB_URI = uri;
}

export async function teardown(): Promise<void> {
  if (mongoServer) await mongoServer.stop();
}
