/**
 * Vitest globalSetup — runs ONCE before ALL test workers start, in the main
 * process. This is the correct place to start MongoMemoryServer because:
 *   1. It runs before any worker imports test files or setupFiles.
 *   2. The URI is written to a temp file; setupFiles reads it synchronously
 *      and sets process.env.MONGODB_URI before any NestJS module constructs.
 *
 * MongoMemoryServer binary: ~100 MB download on first run. CI should pre-warm:
 *   MONGOMS_VERSION=7.0.14 node -e "require('mongodb-memory-server').MongoMemoryServer.create().then(s=>s.stop())"
 * Or point MONGOMS_SYSTEM_BINARY to an existing mongod binary.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import fs from "fs";
import os from "os";
import path from "path";

// Shared temp file path for the URI — workers read this in setupFiles.
export const MONGO_URI_FILE = path.join(os.tmpdir(), "vitest-nestjs-mongo-uri.txt");

let mongoServer: MongoMemoryServer;

export async function setup(): Promise<void> {
  process.env.MONGOMS_VERSION = "7.0.14";
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  // Write URI to temp file so workers can read it before any module imports.
  fs.writeFileSync(MONGO_URI_FILE, uri, "utf8");
  // Also set it in the main process env (for coverage of non-worker contexts).
  process.env.MONGODB_URI = uri;
}

export async function teardown(): Promise<void> {
  if (mongoServer) await mongoServer.stop();
  try {
    fs.unlinkSync(MONGO_URI_FILE);
  } catch {
    /* non-fatal */
  }
}
