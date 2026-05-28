import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { ValidationError } from "../errors.js";

export interface TargetDir {
  absolutePath: string;
  exists: boolean;
  isEmpty: boolean;
}

export function inspectTargetDir(name: string, cwd: string = process.cwd()): TargetDir {
  const absolutePath = resolve(cwd, name);
  if (!existsSync(absolutePath)) {
    return { absolutePath, exists: false, isEmpty: true };
  }
  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    throw new ValidationError(`Target path exists and is not a directory: ${absolutePath}`);
  }
  const entries = readdirSync(absolutePath);
  return { absolutePath, exists: true, isEmpty: entries.length === 0 };
}

export function assertTargetDirOk(target: TargetDir, force: boolean): void {
  if (!target.exists) return;
  if (target.isEmpty) return;
  if (force) return;
  throw new ValidationError(
    `Target directory not empty: ${target.absolutePath}. Pass --force to overwrite.`,
  );
}
