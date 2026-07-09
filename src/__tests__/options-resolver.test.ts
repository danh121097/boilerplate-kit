import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../runtime/tty.js", () => ({ isInteractive: () => false }));

import { ValidationError } from "../errors.js";
import { resolveOptions } from "../options-resolver.js";
import { DEFAULT_REF, type Template } from "../types.js";

describe("resolveOptions (non-interactive)", () => {
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    // realpathSync to resolve macOS /var → /private/var symlink so path comparisons match
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), "prism-resolver-")));
    originalCwd = process.cwd();
    process.chdir(tmpRoot);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns a fully-resolved ResolvedOptions when every flag is provided", async () => {
    const opts = await resolveOptions({
      name: "my-app",
      template: "vuejs",
      pm: "pnpm",
      git: true,
      install: false,
      ref: "main",
    });
    expect(opts.name).toBe("my-app");
    expect(opts.template).toBe("vuejs");
    expect(opts.pm).toBe("pnpm");
    expect(opts.git).toBe(true);
    expect(opts.install).toBe(false);
    expect(opts.ref).toBe("main");
    expect(opts.force).toBe(false);
    expect(opts.latest).toBe(false);
    expect(opts.harness).toBe(false);
    expect(opts.targetDir).toBe(join(tmpRoot, "my-app"));
  });

  it("propagates --latest flag", async () => {
    const opts = await resolveOptions({
      name: "x",
      template: "vuejs",
      pm: "pnpm",
      latest: true,
    });
    expect(opts.latest).toBe(true);
  });

  it("defaults harness to false and propagates --harness", async () => {
    const off = await resolveOptions({ name: "h0", template: "vuejs", pm: "pnpm" });
    expect(off.harness).toBe(false);
    const on = await resolveOptions({ name: "h1", template: "vuejs", pm: "pnpm", harness: true });
    expect(on.harness).toBe(true);
  });

  it("defaults ref to 'latest' when omitted", async () => {
    const opts = await resolveOptions({
      name: "x",
      template: "reactjs",
      pm: "npm",
      git: false,
      install: false,
    });
    expect(opts.ref).toBe(DEFAULT_REF);
  });

  it("defaults git/install to true in non-interactive when omitted", async () => {
    const opts = await resolveOptions({
      name: "x",
      template: "nextjs",
      pm: "bun",
    });
    expect(opts.git).toBe(true);
    expect(opts.install).toBe(true);
  });

  it("resolves the react-native template in non-interactive mode", async () => {
    const opts = await resolveOptions({
      name: "x",
      template: "react-native",
      pm: "pnpm",
    });
    expect(opts.template).toBe("react-native");
  });

  it("throws when --name is missing in non-interactive mode", async () => {
    await expect(
      resolveOptions({ template: "vuejs", pm: "pnpm" }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws when --template is missing in non-interactive mode", async () => {
    await expect(resolveOptions({ name: "x", pm: "pnpm" })).rejects.toThrow(ValidationError);
  });

  it("throws when --pm is missing in non-interactive mode", async () => {
    await expect(
      resolveOptions({ name: "x", template: "vuejs" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects an invalid template enum", async () => {
    const bogus = "svelte" as unknown as Template;
    await expect(
      resolveOptions({ name: "x", template: bogus, pm: "pnpm" }),
    ).rejects.toThrow(/template must be one of/);
  });

  it("rejects an invalid pm enum", async () => {
    const bogus = "deno" as unknown as "npm";
    await expect(
      resolveOptions({ name: "x", template: "vuejs", pm: bogus }),
    ).rejects.toThrow(/pm must be one of/);
  });

  it("rejects an invalid project name", async () => {
    await expect(
      resolveOptions({ name: "Bad Name", template: "vuejs", pm: "pnpm" }),
    ).rejects.toThrow(/--name/);
  });

  it("trims whitespace in ref and falls back to default when empty", async () => {
    const opts = await resolveOptions({
      name: "x",
      template: "vuejs",
      pm: "pnpm",
      ref: "   ",
    });
    expect(opts.ref).toBe(DEFAULT_REF);
  });
});
