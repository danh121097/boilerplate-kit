import { spawnSync } from "node:child_process";
import pc from "picocolors";

const INSTALL_URL =
  "https://raw.githubusercontent.com/hoangnb24/repository-harness/main/scripts/install-harness.sh";

function available(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

/**
 * Install the optional repository-harness durable CLI into a freshly scaffolded
 * project. The doc layer already ships with the template; this only adds the
 * per-OS `harness-cli` binary + SQLite schema via the upstream installer
 * (`--merge` keeps the template's existing docs). Best-effort: never aborts the
 * scaffold — on any failure it prints a hint and continues.
 */
export function runHarnessInstall(cwd: string): void {
  if (process.platform === "win32") {
    console.log(
      pc.yellow(
        "⚠ Harness CLI auto-install is Unix-only here. On Windows, run the PowerShell installer from AGENTS.md.",
      ),
    );
    return;
  }
  if (!available("curl") || !available("bash")) {
    console.log(
      pc.yellow("⚠ curl/bash not found — skipping Harness CLI install. See AGENTS.md for manual steps."),
    );
    return;
  }
  const res = spawnSync("bash", ["-c", `curl -fsSL "${INSTALL_URL}" | bash -s -- --merge --yes`], {
    cwd,
    stdio: "ignore",
  });
  if (res.status !== 0) {
    console.log(
      pc.yellow("⚠ Harness CLI install failed — continuing. See AGENTS.md to retry."),
    );
  }
}
