import { generateKeyPairSync } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const keysDir = join(here, "..", "src", "keys");
const privatePath = join(keysDir, "rsa.private");
const publicPath = join(keysDir, "rsa.public");
const force = process.argv.includes("--force");

if (existsSync(privatePath) && !force) process.exit(0);

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
  // File mode is best-effort on platforms without POSIX permissions.
}

console.log("Generated src/keys/rsa.private (600) and src/keys/rsa.public");
