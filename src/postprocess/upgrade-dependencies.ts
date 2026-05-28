import { spawn } from "node:child_process";
import pc from "picocolors";

/**
 * Run `npx -y npm-check-updates@latest -u --packageFile package.json` inside the
 * scaffolded project so every dep/devDep ref in `package.json` is rewritten to
 * its current latest version on the npm registry. The subsequent `pnpm install`
 * step then resolves to those bleeding-edge versions.
 *
 * Non-fatal on failure — we surface a warning and continue with the original
 * ranges so the user still ends up with a working install.
 */
export function upgradeDependencies(cwd: string): Promise<void> {
  return new Promise((resolve) => {
    const proc = spawn(
      "npx",
      ["-y", "npm-check-updates@latest", "-u", "--packageFile", "package.json"],
      { cwd, stdio: "inherit" },
    );

    proc.on("error", (err) => {
      console.log(
        pc.yellow(`⚠ Failed to launch npm-check-updates: ${err.message}. Continuing with original versions.`),
      );
      resolve();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.log(
          pc.yellow(`⚠ npm-check-updates exited with code ${code}. Continuing with original versions.`),
        );
      }
      resolve();
    });
  });
}
