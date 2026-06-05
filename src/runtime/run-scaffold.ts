import { downloadCleanTemplate } from "../fetcher/download-template.js";
import { verifyExtraction } from "../fetcher/verify-extraction.js";
import { runGitInit } from "../postprocess/git-init.js";
import { runInstall } from "../postprocess/install-dependencies.js";
import { rewritePackageJson } from "../postprocess/rewrite-package-json.js";
import { printSuccessBanner } from "../postprocess/success-banner.js";
import { upgradeDependencies } from "../postprocess/upgrade-dependencies.js";
import { spinner } from "@clack/prompts";
import type { ResolvedOptions } from "../types.js";
import pc from "picocolors";

export async function runScaffold(opts: ResolvedOptions): Promise<void> {
  const fetchSpin = spinner();
  const fetchMsg =
    opts.ref === "latest"
      ? `Fetching ${opts.template} template…`
      : `Fetching ${opts.template} template (ref: ${opts.ref})…`;
  fetchSpin.start(fetchMsg);
  try {
    await downloadCleanTemplate({
      template: opts.template,
      ref: opts.ref,
      targetDir: opts.targetDir,
      force: opts.force,
    });
    verifyExtraction(opts.targetDir);
    fetchSpin.stop(`Fetched ${opts.template} template.`);
  } catch (err) {
    fetchSpin.stop(`Failed to fetch ${opts.template} template.`);
    throw err;
  }

  await rewritePackageJson(opts.targetDir, opts.name);

  if (opts.latest) {
    console.log(pc.dim("Upgrading dependencies to their absolute latest…"));
    await upgradeDependencies(opts.targetDir);
  }

  if (opts.git) {
    runGitInit(opts.targetDir);
  }

  if (opts.install) {
    await runInstall(opts.targetDir, opts.pm);
  }

  printSuccessBanner(opts);
}
