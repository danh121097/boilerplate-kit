import pc from "picocolors";
import { relative } from "node:path";
import type { PackageManager, ResolvedOptions } from "../types.js";

const DEV_CMD: Record<PackageManager, string> = {
  npm: "npm run dev",
  yarn: "yarn dev",
  pnpm: "pnpm dev",
  bun: "bun dev",
};

export function formatSuccessLines(opts: ResolvedOptions): string[] {
  const rel = relative(process.cwd(), opts.targetDir) || opts.name;
  const lines: string[] = [
    `${pc.green("✔")} ${pc.bold(opts.name)} ready at ${pc.cyan(opts.targetDir)}`,
    "",
    pc.bold("Next steps:"),
    `  cd ${rel}`,
  ];
  if (!opts.install) lines.push(`  ${opts.pm} install`);
  lines.push(`  ${DEV_CMD[opts.pm]}`);
  return lines;
}

export function printSuccessBanner(opts: ResolvedOptions): void {
  console.log();
  for (const line of formatSuccessLines(opts)) console.log(line);
  console.log();
  console.log(pc.dim("Happy hacking!"));
}
