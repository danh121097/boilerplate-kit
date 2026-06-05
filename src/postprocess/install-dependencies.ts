import { installDependencies } from "nypm";
import type { PackageManager } from "../types.js";
import pc from "picocolors";

export async function runInstall(cwd: string, packageManager: PackageManager): Promise<void> {
  try {
    await installDependencies({
      cwd,
      packageManager,
      silent: false,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(pc.yellow(`⚠ Failed to install dependencies: ${msg}`));
    console.log(pc.dim(`  Retry with: cd ${cwd} && ${packageManager} install`));
  }
}
