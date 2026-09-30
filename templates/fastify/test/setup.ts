import type {} from "./global-setup";
import { afterAll, afterEach, beforeAll, inject } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";

const mongoUri = inject("mongoUri");
const keyDir = mkdtempSync(join(tmpdir(), "fastify-jwt-keys-"));
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = mongoUri;
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-key-for-testing-min32chars";
process.env.JWT_ACCESS_EXPIRY = "15m";
process.env.JWT_REFRESH_EXPIRY = "7d";
process.env.HMAC_SECRET = "test-hmac-secret-key-for-testing-min32chars";
process.env.REDIS_ENABLED = "false";
process.env.API_PREFIX = "/api/v1";
process.env.ENABLE_CSRF = "false";
process.env.JWT_PRIVATE_KEY_PATH = join(keyDir, "rsa.private");
process.env.JWT_PUBLIC_KEY_PATH = join(keyDir, "rsa.public");
writeFileSync(process.env.JWT_PRIVATE_KEY_PATH, privateKey);
writeFileSync(process.env.JWT_PUBLIC_KEY_PATH, publicKey);

beforeAll(async () => {
  await mongoose.connect(mongoUri);
});

afterEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  rmSync(keyDir, { recursive: true, force: true });
});
