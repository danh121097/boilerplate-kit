import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ScaffoldError } from "../errors.js";

export function verifyExtraction(dir: string): void {
  if (!existsSync(dir)) {
    throw new ScaffoldError(`Template extraction failed: ${dir} does not exist.`);
  }
  if (readdirSync(dir).length === 0) {
    throw new ScaffoldError(`Template extraction produced an empty directory: ${dir}`);
  }
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new ScaffoldError(`Template is missing required package.json (expected at ${pkgPath}).`);
  }
  let pkg: unknown;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  } catch (err) {
    throw new ScaffoldError(
      `Template package.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    !pkg ||
    typeof pkg !== "object" ||
    typeof (pkg as { name?: unknown }).name !== "string"
  ) {
    throw new ScaffoldError("Template package.json is missing a string 'name' field.");
  }
  if (!existsSync(join(dir, "README.md"))) {
    throw new ScaffoldError(`Template is missing README.md (expected at ${join(dir, "README.md")}).`);
  }
}
