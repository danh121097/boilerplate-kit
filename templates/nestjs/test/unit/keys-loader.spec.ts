/**
 * loadRsaKeyPair: reads the PEM files with a sign/verify self-test, and fails closed
 * outside test/development instead of silently forging tokens with an ephemeral key.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadRsaKeyPair } from "@/config/keys";

const dirs: string[] = [];

function writeKeyPair(): { privPath: string; pubPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keys-spec-"));
  dirs.push(dir);
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const privPath = path.join(dir, "rsa.private");
  const pubPath = path.join(dir, "rsa.public");
  fs.writeFileSync(privPath, privateKey);
  fs.writeFileSync(pubPath, publicKey);
  return { privPath, pubPath };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("loadRsaKeyPair", () => {
  it("loads matching key files", () => {
    const { privPath, pubPath } = writeKeyPair();
    const { privateKey, publicKey } = loadRsaKeyPair(privPath, pubPath, "production");
    expect(() => crypto.createPrivateKey(privateKey)).not.toThrow();
    expect(() => crypto.createPublicKey(publicKey)).not.toThrow();
  });

  it("generates an ephemeral keypair in test and development when files are missing", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (const env of ["test", "development"]) {
      const { privateKey, publicKey } = loadRsaKeyPair("", "", env);
      const sig = crypto.sign("sha256", Buffer.from("x"), privateKey);
      expect(crypto.verify("sha256", Buffer.from("x"), publicKey, sig)).toBe(true);
    }
  });

  it.each(["production", "staging", ""])("fails closed when files are missing in %j", (env) => {
    expect(() => loadRsaKeyPair("", "", env)).toThrow(/RSA key files missing/);
  });

  it("throws when the private and public keys do not match", () => {
    const a = writeKeyPair();
    const b = writeKeyPair();
    expect(() => loadRsaKeyPair(a.privPath, b.pubPath, "test")).toThrow(/mismatch/i);
  });

  it("throws when a key file is not valid PEM", () => {
    const { privPath, pubPath } = writeKeyPair();
    fs.writeFileSync(privPath, "not-a-pem");
    expect(() => loadRsaKeyPair(privPath, pubPath, "test")).toThrow();
  });
});
