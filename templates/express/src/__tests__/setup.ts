/// <reference types="node" />
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

let mongoServer: MongoMemoryServer;

// Set test env vars BEFORE any app imports
process.env.NODE_ENV = 'test';

// Generate a real RSA keypair on disk so the file-load branch of loadRsaKeyPair
// is exercised (not the ephemeral fallback) and sign/verify share one key.
const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwt-keys-'));
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync(path.join(keyDir, 'rsa.private'), privateKey);
fs.writeFileSync(path.join(keyDir, 'rsa.public'), publicKey);
process.env.JWT_PRIVATE_KEY_PATH = path.join(keyDir, 'rsa.private');
process.env.JWT_PUBLIC_KEY_PATH = path.join(keyDir, 'rsa.public');

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-min32';
process.env.JWT_ACCESS_EXPIRY = '15m';
process.env.JWT_REFRESH_EXPIRY = '7d';
process.env.HMAC_SECRET = 'test-hmac-secret-key-for-testing-min32chars';
process.env.MONGODB_URI = 'mongodb://placeholder';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongoServer.getUri();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});
