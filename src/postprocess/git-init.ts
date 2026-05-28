import { spawnSync } from "node:child_process";
import pc from "picocolors";

function gitAvailable(): boolean {
  const res = spawnSync("git", ["--version"], { stdio: "ignore" });
  return res.status === 0;
}

function runGit(args: string[], cwd: string): boolean {
  const res = spawnSync("git", args, { cwd, stdio: "ignore" });
  return res.status === 0;
}

export function runGitInit(cwd: string): void {
  if (!gitAvailable()) {
    console.log(pc.yellow("⚠ git not found in PATH — skipping git init."));
    return;
  }
  const ok =
    runGit(["init", "-b", "main"], cwd) &&
    runGit(["add", "-A"], cwd) &&
    runGit(
      ["commit", "-m", "chore: initial commit from create-prism-app"],
      cwd,
    );
  if (!ok) {
    console.log(
      pc.yellow(
        "⚠ git init failed (missing user.name/email or signing required?) — continuing.",
      ),
    );
  }
}
