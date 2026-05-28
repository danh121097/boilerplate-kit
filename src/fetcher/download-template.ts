import { downloadTemplate } from "giget";
import { cp, mkdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ScaffoldError, TemplateFetchError } from "../errors.js";
import { getSource } from "./template-registry.js";
import { validateRef } from "./validate-ref.js";
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
  ".vite",
  "pnpm-lock.yaml",
  "auto-imports.d.ts",
  "components.d.ts",
]);

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
  await cp(srcDir, targetDir, {
    recursive: true,
    filter: (src) => {
      const base = src.split("/").pop() ?? "";
      return !LOCAL_COPY_EXCLUDE.has(base);
    },
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
