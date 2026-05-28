import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ScaffoldError } from "../errors.js";

export async function rewritePackageJson(targetDir: string, name: string): Promise<void> {
  const pkgPath = join(targetDir, "package.json");

  let raw: string;
  try {
    raw = await readFile(pkgPath, "utf8");
  } catch (err) {
    throw new ScaffoldError(
      `Cannot read package.json at ${pkgPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new ScaffoldError(
      `Invalid JSON in ${pkgPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  pkg.name = name;
  // The template's pinned PM must not override the user's selection at install time.
  delete pkg.packageManager;

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
}
