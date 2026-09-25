import { listLocalTemplateFiles } from "../fetcher/download-template.js";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("listLocalTemplateFiles", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prism-local-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("returns null outside a git work tree", () => {
    expect(listLocalTemplateFiles(root)).toBeNull();
  });

  it("mirrors the git index: committed stubs ship, ignored and secret files don't", () => {
    spawnSync("git", ["init", "-q"], { cwd: root });
    const tpl = join(root, "templates", "vuejs");
    mkdirSync(join(tpl, "src"), { recursive: true });
    writeFileSync(join(tpl, ".gitignore"), "dist/\nnode_modules/\n");
    writeFileSync(join(tpl, "package.json"), "{}");
    writeFileSync(join(tpl, "auto-imports.d.ts"), "export {}");
    writeFileSync(join(tpl, "src", "main.ts"), "");
    writeFileSync(join(tpl, "pnpm-lock.yaml"), "");
    writeFileSync(join(tpl, ".env"), "SECRET=1");
    mkdirSync(join(tpl, "dist"));
    writeFileSync(join(tpl, "dist", "out.js"), "");
    spawnSync("git", ["add", "-A", "-f", "--", "package.json", "auto-imports.d.ts", "pnpm-lock.yaml"], {
      cwd: tpl,
    });

    const files = listLocalTemplateFiles(tpl)?.sort();
    expect(files).toEqual([".gitignore", "auto-imports.d.ts", "package.json", "src/main.ts"]);
  });

  it("skips tracked files deleted from the working tree", () => {
    spawnSync("git", ["init", "-q"], { cwd: root });
    const tpl = join(root, "templates", "reactjs");
    mkdirSync(tpl, { recursive: true });
    writeFileSync(join(tpl, "package.json"), "{}");
    writeFileSync(join(tpl, "gone.ts"), "");
    spawnSync("git", ["add", "-A"], { cwd: tpl });
    rmSync(join(tpl, "gone.ts"));

    expect(listLocalTemplateFiles(tpl)).toEqual(["package.json"]);
  });

  it("returns null when the template is not at <repo>/templates/<name>", () => {
    spawnSync("git", ["init", "-q"], { cwd: root });
    const tpl = join(root, "vendor", "templates", "vuejs");
    mkdirSync(tpl, { recursive: true });
    writeFileSync(join(tpl, "package.json"), "{}");

    expect(listLocalTemplateFiles(tpl)).toBeNull();
  });

  it("returns null when git lists nothing (template ignored by its repo)", () => {
    spawnSync("git", ["init", "-q"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), "templates/\n");
    const tpl = join(root, "templates", "vuejs");
    mkdirSync(tpl, { recursive: true });
    writeFileSync(join(tpl, "package.json"), "{}");

    expect(listLocalTemplateFiles(tpl)).toBeNull();
  });
});
