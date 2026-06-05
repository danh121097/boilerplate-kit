import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRsaKeyPair } from '@/config/keys';

/** Write a fresh RSA keypair to a temp dir, return the two file paths */
function writeTempKeyPair(): { privPath: string; pubPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-test-'));
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  const privPath = path.join(dir, 'rsa.private');
  const pubPath = path.join(dir, 'rsa.public');
  fs.writeFileSync(privPath, privateKey);
  fs.writeFileSync(pubPath, publicKey);
  return { privPath, pubPath };
}

describe('loadRsaKeyPair', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('loads matching key files and passes self-test', () => {
    const { privPath, pubPath } = writeTempKeyPair();
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', privPath);
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', pubPath);

    const { privateKey, publicKey } = loadRsaKeyPair();
    expect(privateKey).toContain('PRIVATE KEY');
    expect(publicKey).toContain('PUBLIC KEY');
    // key string is usable by node crypto
    expect(() => crypto.createPrivateKey(privateKey)).not.toThrow();
  });

  it('generates an ephemeral keypair when files missing in test env', () => {
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', '');
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', '');
    vi.stubEnv('NODE_ENV', 'test');

    const { privateKey, publicKey } = loadRsaKeyPair();
    // assert node accepts the keys rather than checking a specific PEM header
    expect(() => crypto.createPrivateKey(privateKey)).not.toThrow();
    expect(() => crypto.createPublicKey(publicKey)).not.toThrow();
  });

  it('throws (fail-closed) when files missing in production', () => {
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', '');
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => loadRsaKeyPair()).toThrow();
  });

  it('throws (fail-closed) when files missing and NODE_ENV is staging', () => {
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', '');
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', '');
    vi.stubEnv('NODE_ENV', 'staging');
    expect(() => loadRsaKeyPair()).toThrow();
  });

  it('throws (fail-closed) when files missing and NODE_ENV is unset', () => {
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', '');
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', '');
    vi.stubEnv('NODE_ENV', undefined);
    expect(() => loadRsaKeyPair()).toThrow();
  });

  it('throws at load when private/public keys do not match', () => {
    const a = writeTempKeyPair();
    const b = writeTempKeyPair();
    // mismatched pair: private from A, public from B
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', a.privPath);
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', b.pubPath);
    expect(() => loadRsaKeyPair()).toThrow(/mismatch/i);
  });

  it('throws at load when a key file is malformed PEM', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-bad-'));
    const privPath = path.join(dir, 'rsa.private');
    const pubPath = path.join(dir, 'rsa.public');
    fs.writeFileSync(privPath, 'not-a-valid-pem');
    fs.writeFileSync(pubPath, 'not-a-valid-pem');
    vi.stubEnv('JWT_PRIVATE_KEY_PATH', privPath);
    vi.stubEnv('JWT_PUBLIC_KEY_PATH', pubPath);
    expect(() => loadRsaKeyPair()).toThrow();
  });
});
