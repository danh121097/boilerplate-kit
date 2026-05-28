import { describe, expect, it } from "vitest";
import { formatSuccessLines } from "../postprocess/success-banner.js";
import type { PackageManager, ResolvedOptions } from "../types.js";

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;]*m/g;
const strip = (s: string): string => s.replace(ANSI, "");

function base(overrides: Partial<ResolvedOptions> = {}): ResolvedOptions {
  return {
    name: "demo",
    template: "vuejs",
    pm: "pnpm",
    git: true,
    install: true,
    force: false,
    ref: "latest",
    latest: false,
    targetDir: `${process.cwd()}/demo`,
    ...overrides,
  };
}

describe("formatSuccessLines", () => {
  it("emits the project name in the heading", () => {
    const lines = formatSuccessLines(base()).map(strip);
    expect(lines[0]).toContain("demo ready at");
  });

  it("includes a 'cd <name>' next step", () => {
    const lines = formatSuccessLines(base()).map(strip);
    expect(lines).toContain("  cd demo");
  });

  it.each<[PackageManager, string]>([
    ["npm", "  npm run dev"],
    ["yarn", "  yarn dev"],
    ["pnpm", "  pnpm dev"],
    ["bun", "  bun dev"],
  ])("maps pm=%s to the right dev command", (pm, expected) => {
    const lines = formatSuccessLines(base({ pm })).map(strip);
    expect(lines).toContain(expected);
  });

  it("inserts an install step when --no-install", () => {
    const lines = formatSuccessLines(base({ install: false, pm: "pnpm" })).map(strip);
    expect(lines).toContain("  pnpm install");
    expect(lines).toContain("  pnpm dev");
  });

  it("omits the install step when --install", () => {
    const lines = formatSuccessLines(base({ install: true, pm: "yarn" })).map(strip);
    expect(lines).not.toContain("  yarn install");
    expect(lines).toContain("  yarn dev");
  });
});
