import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertTargetDirOk,
  inspectTargetDir,
  type TargetDir,
} from "../validators/validate-target-dir.js";
import { ValidationError } from "../errors.js";

describe("inspectTargetDir", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "prism-inspect-"));
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("reports a non-existent dir as empty", () => {
    const t = inspectTargetDir("brand-new", cwd);
    expect(t.exists).toBe(false);
    expect(t.isEmpty).toBe(true);
    expect(t.absolutePath).toBe(join(cwd, "brand-new"));
  });

  it("reports an empty existing dir as empty", () => {
    mkdirSync(join(cwd, "empty"));
    const t = inspectTargetDir("empty", cwd);
    expect(t.exists).toBe(true);
    expect(t.isEmpty).toBe(true);
  });

  it("reports a non-empty dir", () => {
    mkdirSync(join(cwd, "full"));
    writeFileSync(join(cwd, "full", "f"), "x");
    const t = inspectTargetDir("full", cwd);
    expect(t.exists).toBe(true);
    expect(t.isEmpty).toBe(false);
  });

  it("throws when target path is a file, not a dir", () => {
    writeFileSync(join(cwd, "file.txt"), "x");
    expect(() => inspectTargetDir("file.txt", cwd)).toThrow(ValidationError);
  });
});

describe("assertTargetDirOk", () => {
  const fresh: TargetDir = { absolutePath: "/x", exists: false, isEmpty: true };
  const emptyExisting: TargetDir = { absolutePath: "/x", exists: true, isEmpty: true };
  const nonEmpty: TargetDir = { absolutePath: "/x", exists: true, isEmpty: false };

  it("passes for a non-existent dir", () => {
    expect(() => assertTargetDirOk(fresh, false)).not.toThrow();
  });
  it("passes for an empty existing dir", () => {
    expect(() => assertTargetDirOk(emptyExisting, false)).not.toThrow();
  });
  it("throws for a non-empty dir without --force", () => {
    expect(() => assertTargetDirOk(nonEmpty, false)).toThrow(ValidationError);
  });
  it("passes for a non-empty dir with --force", () => {
    expect(() => assertTargetDirOk(nonEmpty, true)).not.toThrow();
  });
});
