import { downloadCleanTemplate } from "../fetcher/download-template.js";
import { downloadTemplate } from "giget";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("giget", () => ({ downloadTemplate: vi.fn() }));

describe("remote template extraction", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-remote-"));
    vi.stubEnv("BOILERPLATE_KIT_LOCAL", "");
    vi.mocked(downloadTemplate).mockImplementation(async (_source, options) => {
      const dir = options!.dir!;
      await mkdir(dir, { recursive: true });
      await Promise.all([
        writeFile(join(dir, "package.json"), '{"name":"starter"}'),
        writeFile(join(dir, "README.md"), "starter"),
        writeFile(join(dir, "bun.lock"), "template lock"),
        writeFile(join(dir, "pnpm-lock.yaml"), "template lock"),
        writeFile(join(dir, ".env"), "private"),
        writeFile(join(dir, ".env.production"), "private"),
        writeFile(join(dir, ".env.example"), "example"),
        writeFile(join(dir, "auto-imports.d.ts"), "export {};"),
      ]);
      return { dir, source: "fixture", name: "fixture" } as never;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("excludes lockfiles and secrets but preserves committed template assets", async () => {
    const targetDir = join(root, "new-project");
    await downloadCleanTemplate({ template: "express", ref: "master", targetDir });
    expect(existsSync(join(targetDir, "package.json"))).toBe(true);
    expect(existsSync(join(targetDir, "auto-imports.d.ts"))).toBe(true);
    expect(existsSync(join(targetDir, "bun.lock"))).toBe(false);
    expect(existsSync(join(targetDir, "pnpm-lock.yaml"))).toBe(false);
    expect(existsSync(join(targetDir, ".env"))).toBe(false);
    expect(existsSync(join(targetDir, ".env.production"))).toBe(false);
    expect(existsSync(join(targetDir, ".env.example"))).toBe(true);
  });

  it("preserves existing lockfiles when overwriting a nonempty project", async () => {
    writeFileSync(join(root, "bun.lock"), "existing lock");
    await downloadCleanTemplate({
      template: "express",
      ref: "master",
      targetDir: root,
      force: true,
    });
    expect(readFileSync(join(root, "bun.lock"), "utf8")).toBe("existing lock");
    expect(existsSync(join(root, "package.json"))).toBe(true);
  });
});
