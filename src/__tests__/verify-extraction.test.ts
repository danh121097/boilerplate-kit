import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyExtraction } from "../fetcher/verify-extraction.js";
import { ScaffoldError } from "../errors.js";

describe("verifyExtraction", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prism-verify-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("accepts a dir with package.json + README.md", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    writeFileSync(join(dir, "README.md"), "# x");
    expect(() => verifyExtraction(dir)).not.toThrow();
  });

  it("rejects an empty dir", () => {
    expect(() => verifyExtraction(dir)).toThrow(ScaffoldError);
    expect(() => verifyExtraction(dir)).toThrow(/empty/);
  });

  it("rejects a dir without package.json", () => {
    writeFileSync(join(dir, "README.md"), "# x");
    expect(() => verifyExtraction(dir)).toThrow(/package\.json/);
  });

  it("rejects a dir without README.md", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
    expect(() => verifyExtraction(dir)).toThrow(/README\.md/);
  });

  it("rejects package.json missing a name field", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({}));
    writeFileSync(join(dir, "README.md"), "# x");
    expect(() => verifyExtraction(dir)).toThrow(/name/);
  });

  it("rejects malformed package.json", () => {
    writeFileSync(join(dir, "package.json"), "{ not json");
    writeFileSync(join(dir, "README.md"), "# x");
    expect(() => verifyExtraction(dir)).toThrow(/JSON/);
  });
});
