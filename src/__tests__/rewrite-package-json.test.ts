import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rewritePackageJson } from "../postprocess/rewrite-package-json.js";
import { ScaffoldError } from "../errors.js";

describe("rewritePackageJson", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "prism-rewrite-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function read(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as Record<string, unknown>;
  }

  it("rewrites the name field", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "template-original", version: "0.0.0" }),
    );
    await rewritePackageJson(dir, "my-fresh-app");
    expect(read().name).toBe("my-fresh-app");
  });

  it("preserves all other top-level fields", async () => {
    const original = {
      name: "template",
      version: "1.2.3",
      description: "demo",
      scripts: { dev: "vite" },
      dependencies: { vue: "^3" },
      devDependencies: { vite: "^6" },
      keywords: ["a", "b"],
    };
    writeFileSync(join(dir, "package.json"), JSON.stringify(original));
    await rewritePackageJson(dir, "renamed");
    const out = read();
    expect(out.version).toBe("1.2.3");
    expect(out.description).toBe("demo");
    expect(out.scripts).toEqual({ dev: "vite" });
    expect(out.dependencies).toEqual({ vue: "^3" });
    expect(out.devDependencies).toEqual({ vite: "^6" });
    expect(out.keywords).toEqual(["a", "b"]);
  });

  it("strips packageManager field so user's PM choice wins", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "t", packageManager: "pnpm@9.0.0" }),
    );
    await rewritePackageJson(dir, "x");
    expect(read()).not.toHaveProperty("packageManager");
  });

  it("writes 2-space indent + trailing newline", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "t", a: 1 }));
    await rewritePackageJson(dir, "x");
    const raw = readFileSync(join(dir, "package.json"), "utf8");
    expect(raw).toMatch(/^\{\n[ ]{2}"name": "x",\n[ ]{2}"a": 1\n\}\n$/);
  });

  it("throws ScaffoldError on missing package.json", async () => {
    await expect(rewritePackageJson(dir, "x")).rejects.toThrow(ScaffoldError);
  });

  it("throws ScaffoldError on invalid JSON", async () => {
    writeFileSync(join(dir, "package.json"), "{ not json");
    await expect(rewritePackageJson(dir, "x")).rejects.toThrow(/Invalid JSON/);
  });
});
