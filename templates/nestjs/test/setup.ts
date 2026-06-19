/// <reference types="node" />
/**
 * Vitest setupFiles — runs in EACH test worker before any test file imports.
 *
 * MongoMemoryServer is started in global-setup.ts (main process, before workers).
 * This file reads the URI from the temp file global-setup wrote and sets all
 * required env vars synchronously — before NestJS ConfigModule / AppConfigService
 * are ever constructed.
 *
 * Lifecycle:
 *   globalSetup.setup()     → starts mongod, writes URI to temp file
 *   setupFiles (this file)  → reads URI, sets process.env, wires mongoose hooks
 *   test file beforeAll     → creates NestJS app (reads env from process.env ✓)
 *   test file afterEach     → (flush via global afterEach below)
 *   globalSetup.teardown()  → stops mongod, removes temp file
 */
import { MONGO_URI_FILE } from "./global-setup";
import { afterAll, afterEach, beforeAll } from "vitest";
import crypto from "crypto";
import fs from "fs";
import mongoose from "mongoose";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// Read MongoDB URI from temp file written by globalSetup (synchronous — safe
// at module-eval time because globalSetup runs before any worker starts).
// ---------------------------------------------------------------------------
const mongoUri = fs.readFileSync(MONGO_URI_FILE, "utf8").trim();

// ---------------------------------------------------------------------------
// All env vars — set synchronously here so they are present when any module
// (including NestJS ConfigModule) is first imported in the same worker.
// ---------------------------------------------------------------------------
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = mongoUri;
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-for-testing-min-32chars";
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "7d";
process.env.HMAC_SECRET = "test-hmac-secret-key-for-testing-min32chars";
process.env.REDIS_ENABLED = "false";
process.env.API_PREFIX = "/api/v1";
process.env.ENABLE_CSRF = "false";
process.env.APP_NAME = "nestjs-test";

// Generate an RSA keypair once per worker and write to a temp dir.
// Using real key files (not ephemeral) ensures loadRsaKeyPair exercises the
// file-read branch and sign/verify use the same key within the worker.
const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "nestjs-jwt-keys-"));
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
fs.writeFileSync(path.join(keyDir, "rsa.private"), privateKey);
fs.writeFileSync(path.join(keyDir, "rsa.public"), publicKey);
process.env.JWT_PRIVATE_KEY_PATH = path.join(keyDir, "rsa.private");
process.env.JWT_PUBLIC_KEY_PATH = path.join(keyDir, "rsa.public");

// ---------------------------------------------------------------------------
// Mongoose connection — shared within each worker for afterEach flush.
// Each e2e spec also connects via AppModule/DatabaseModule internally; the
// direct mongoose connection here is for the afterEach collection wipe.
// ---------------------------------------------------------------------------
beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  // Clean up temp RSA key files (non-fatal).
  try {
    fs.unlinkSync(path.join(keyDir, "rsa.private"));
    fs.unlinkSync(path.join(keyDir, "rsa.public"));
    fs.rmdirSync(keyDir);
  } catch {
    /* ignore */
  }
});

afterEach(async () => {
  // Flush all collections between tests so each test starts with a clean DB.
  if (mongoose.connection.readyState === 1) {
    const { collections } = mongoose.connection;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
});
