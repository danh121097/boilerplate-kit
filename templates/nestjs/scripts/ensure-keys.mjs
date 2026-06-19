// Portable RSA keypair bootstrap for JWT access-token signing (RS256).
//
// Runs on `predev` / `pnpm keys` across any package manager and OS — uses Node's
// built-in crypto (no `sh`/openssl dependency). If the keypair already exists it
// is a no-op; pass `--force` to rotate (invalidates live tokens).
//
// For manual/openssl-based generation or CI, `src/keys/setup.sh` is also provided.

import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const keysDir = join(here, "..", "src", "keys");
const privatePath = join(keysDir, "rsa.private");
const publicPath = join(keysDir, "rsa.public");
const force = process.argv.includes("--force");

if (existsSync(privatePath) && !force) {
  process.exit(0);
}

mkdirSync(keysDir, { recursive: true });

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey, { mode: 0o644 });
try {
  chmodSync(privatePath, 0o600);
} catch {
  // chmod is best-effort (e.g. Windows) — the key file is still written.
}

console.log("Generated src/keys/rsa.private (600) and src/keys/rsa.public");
