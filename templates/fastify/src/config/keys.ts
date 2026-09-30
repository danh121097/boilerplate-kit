import { logger } from "@/utils/logger";
import crypto from "crypto";
import fs from "fs";

/** Envs allowed to fall back to an ephemeral keypair when key files are absent */
const EPHEMERAL_ENVS = new Set(["test", "development"]);

/**
 * Throw early if the PEM is malformed or the private/public keys don't match.
 * Converts a would-be runtime 500 into a loud boot failure.
 */
function selfTest(privateKey: string, publicKey: string): void {
  const probe = Buffer.from("rsa-keypair-selftest");
  const signature = crypto.sign("sha256", probe, privateKey);
  const matches = crypto.verify("sha256", probe, publicKey, signature);
  if (!matches) {
    throw new Error("[keys] private/public key mismatch");
  }
}

/**
 * Resolve the RSA keypair used to sign/verify access tokens (RS256).
 *
 * Priority:
 *   1. Read PEM files from JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH (+ self-test).
 *   2. Fail-closed: only test/development may fall back to an ephemeral in-memory
 *      keypair. Any other env (staging, unset, production) throws — never forge
 *      tokens silently.
 *
 * The ephemeral keypair is per-process and does not survive a restart; it is for
 * local/test convenience only.
 */
export function loadRsaKeyPair(): { privateKey: string; publicKey: string } {
  const privPath = process.env.JWT_PRIVATE_KEY_PATH;
  const pubPath = process.env.JWT_PUBLIC_KEY_PATH;

  if (privPath && pubPath && fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    const privateKey = fs.readFileSync(privPath, "utf8");
    const publicKey = fs.readFileSync(pubPath, "utf8");
    selfTest(privateKey, publicKey);
    return { privateKey, publicKey };
  }

  if (!EPHEMERAL_ENVS.has(process.env.NODE_ENV ?? "")) {
    throw new Error(
      "[keys] RSA key files missing — set JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH (run keys/setup.sh)",
    );
  }

  logger.warn(
    "[keys] RSA key files missing — generating ephemeral keypair (single-process, non-persistent)",
  );
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}
