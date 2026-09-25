import { ScaffoldError, TemplateFetchError } from "../errors.js";
import { getSource } from "./template-registry.js";
import { validateRef } from "./validate-ref.js";
import { downloadTemplate } from "giget";
import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { cp, mkdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Template } from "../types.js";

export interface DownloadOpts {
  template: Template;
  ref: string;
  targetDir: string;
  force?: boolean;
}

const TRANSIENT_CODES = new Set(["ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]);
const MAX_ATTEMPTS = 2;
const LOCAL_COPY_EXCLUDE = new Set([
  "node_modules",
  "dist",
  "coverage",
  "tsconfig.tsbuildinfo",
  ".vite",
  // Nuxt
  ".nuxt",
  ".output",
  ".data",
  // Lock files — user gets a fresh one from their chosen PM after scaffold.
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
  "bun.lock",
  // Never copy a contributor's local env into a scaffold (.env.example still ships).
  ".env",
  // Never copy a contributor's locally-generated RSA signing keys into a scaffold.
  // The backend templates regenerate them on first run (`pnpm keys` / predev).
  "rsa.private",
  "rsa.public",
]);
// Generated auto-import stubs are shipped only when a template commits them
// (vuejs does, so a cold scaffold lints/typechecks). Git mode follows the index;
// the plain-copy fallback has no index, so it drops them.
const FALLBACK_COPY_EXCLUDE = new Set([
  "auto-imports.d.ts",
  "components.d.ts",
  ".eslintrc-auto-import.json",
]);

function isExcluded(relOrAbsPath: string, extra?: Set<string>): boolean {
  const parts = relOrAbsPath.split(/[\\/]/);
  return parts.some((p) => LOCAL_COPY_EXCLUDE.has(p) || (extra?.has(p) ?? false));
}

/**
 * Files a local template would ship, mirroring a GitHub fetch: tracked plus
 * untracked-but-not-ignored files (so a contributor's new files show up), minus
 * the always-excluded set. Returns `null` — so the caller falls back to a plain
 * copy — unless `srcDir` sits at `<repo>/templates/<name>` in its own git work
 * tree; a templates folder nested in some other repo may be ignored there, and
 * its listing would silently drop files.
 */
export function listLocalTemplateFiles(srcDir: string): string[] | null {
  const git = (args: string[]) => spawnSync("git", args, { cwd: srcDir, encoding: "utf8" });

  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0 || typeof top.stdout !== "string") return null;
  try {
    const repoRoot = realpathSync.native(top.stdout.trim());
    if (realpathSync.native(dirname(dirname(srcDir))) !== repoRoot) return null;
  } catch {
    return null;
  }

  const res = git(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", "."]);
  if (res.status !== 0 || typeof res.stdout !== "string") return null;
  const files = res.stdout
    .split("\0")
    .filter((rel) => rel.length > 0 && !isExcluded(rel))
    .filter((rel) => existsSync(join(srcDir, rel))); // skip tracked-but-deleted
  return files.length > 0 ? files : null;
}

/**
 * Resolve the absolute path of a local template if available, else `null`.
 *
 * Precedence:
 *   1. `BOILERPLATE_KIT_LOCAL` env var — explicit override (CI / contributors).
 *      - Absolute path: used as the templates root.
 *      - `1` (or any non-absolute string): resolved as `${cwd}/templates`.
 *   2. Auto-detect — a sibling `templates/` next to the CLI binary. Resolves
 *      symlinks so an `npm link`'d install picks up the source repo's templates.
 *      In production (`npm install create-prism-app`) the npm package ships
 *      only `dist/` — no sibling `templates/` — so this returns `null` and the
 *      CLI falls back to giget+GitHub.
 */
async function resolveLocalTemplatePath(template: Template): Promise<string | null> {
  const envRoot = process.env.BOILERPLATE_KIT_LOCAL;
  if (envRoot) {
    const root = isAbsolute(envRoot)
      ? envRoot
      : resolve(process.cwd(), envRoot === "1" ? "templates" : envRoot);
    const path = resolve(root, template);
    if (!existsSync(path)) {
      throw new ScaffoldError(
        `BOILERPLATE_KIT_LOCAL is set but template not found at ${path}.`,
        "Check that the directory exists and contains the requested template.",
      );
    }
    return path;
  }

  try {
    const cliFile = await realpath(fileURLToPath(import.meta.url));
    const candidate = resolve(dirname(cliFile), "..", "templates", template);
    if (existsSync(candidate)) return candidate;
  } catch {
    // realpath can fail in odd setups; treat as "no local source available".
  }
  return null;
}

async function copyLocalTemplate(srcDir: string, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const files = listLocalTemplateFiles(srcDir);
  if (files) {
    for (const rel of files) {
      const dest = join(targetDir, rel);
      await mkdir(dirname(dest), { recursive: true });
      await cp(join(srcDir, rel), dest);
    }
    return;
  }
  await cp(srcDir, targetDir, {
    recursive: true,
    filter: (src) => !isExcluded(basename(src), FALLBACK_COPY_EXCLUDE),
  });
}

export async function downloadCleanTemplate(opts: DownloadOpts): Promise<void> {
  validateRef(opts.ref);

  // Local mode — copy from filesystem, skip giget entirely.
  const localPath = await resolveLocalTemplatePath(opts.template);
  if (localPath) {
    await copyLocalTemplate(localPath, opts.targetDir);
    return;
  }

  const source = getSource(opts.template, opts.ref);

  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await downloadTemplate(source, {
        dir: opts.targetDir,
        force: opts.force ?? false,
        preferOffline: false,
      });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS && isTransient(err)) continue;
      throw wrapFetchError(err, source);
    }
  }
  // Unreachable; here only to satisfy the type checker.
  throw wrapFetchError(lastErr, source);
}

function isTransient(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && TRANSIENT_CODES.has(code);
}

function wrapFetchError(err: unknown, source: string): TemplateFetchError {
  const msg = err instanceof Error ? err.message : String(err);
  return new TemplateFetchError(
    `Failed to fetch template from ${source}: ${msg}`,
    source,
    "Check your internet connection or pass a different --ref.",
  );
}
