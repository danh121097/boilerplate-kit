import { ValidationError } from "./errors.js";
import { isInteractive } from "./runtime/tty.js";
import {
  DEFAULT_REF,
  PACKAGE_MANAGERS,
  TEMPLATES,
  type PackageManager,
  type PartialOptions,
  type ResolvedOptions,
  type Template,
} from "./types.js";
import { validateProjectName } from "./validators/validate-project-name.js";
import { assertTargetDirOk, inspectTargetDir } from "./validators/validate-target-dir.js";
import { promptGit } from "./wizard/prompt-git.js";
import { promptInstall } from "./wizard/prompt-install.js";
import { promptLatest } from "./wizard/prompt-latest.js";
import { promptPackageManager } from "./wizard/prompt-package-manager.js";
import { promptProjectName } from "./wizard/prompt-project-name.js";
import { promptTemplate } from "./wizard/prompt-template.js";
import { intro } from "@clack/prompts";
import pc from "picocolors";

function failMissingFlag(flag: string): never {
  throw new ValidationError(`Missing required option in non-interactive mode: --${flag}`);
}

function assertTemplate(t: string): asserts t is Template {
  if (!(TEMPLATES as readonly string[]).includes(t)) {
    throw new ValidationError(`--template must be one of: ${TEMPLATES.join(", ")}`);
  }
}

function assertPm(p: string): asserts p is PackageManager {
  if (!(PACKAGE_MANAGERS as readonly string[]).includes(p)) {
    throw new ValidationError(`--pm must be one of: ${PACKAGE_MANAGERS.join(", ")}`);
  }
}

export async function resolveOptions(partial: PartialOptions): Promise<ResolvedOptions> {
  const interactive = isInteractive();
  if (interactive) intro(pc.bgCyan(pc.black(" create-prism-app ")));

  let name: string;
  if (partial.name !== undefined) {
    const v = validateProjectName(partial.name);
    if (!v.ok) throw new ValidationError(`--name: ${v.reason}`);
    name = v.name;
  } else if (interactive) {
    name = await promptProjectName();
  } else {
    failMissingFlag("name");
  }

  let template: Template;
  if (partial.template !== undefined) {
    assertTemplate(partial.template);
    template = partial.template;
  } else if (interactive) {
    template = await promptTemplate();
  } else {
    failMissingFlag("template");
  }

  let pm: PackageManager;
  if (partial.pm !== undefined) {
    assertPm(partial.pm);
    pm = partial.pm;
  } else if (interactive) {
    pm = await promptPackageManager();
  } else {
    failMissingFlag("pm");
  }

  const git =
    partial.git !== undefined ? partial.git : interactive ? await promptGit() : true;
  const install =
    partial.install !== undefined
      ? partial.install
      : interactive
        ? await promptInstall()
        : true;

  // Only ask about latest-version upgrades when we're actually going to install.
  // Skipping install + asking would be confusing and the answer would be ignored.
  let latest: boolean;
  if (partial.latest !== undefined) {
    latest = partial.latest;
  } else if (interactive && install) {
    latest = await promptLatest();
  } else {
    latest = false;
  }

  const target = inspectTargetDir(name);
  assertTargetDirOk(target, partial.force ?? false);

  const ref = partial.ref?.trim();
  return {
    name,
    template,
    pm,
    git,
    install,
    force: partial.force ?? false,
    ref: ref && ref.length > 0 ? ref : DEFAULT_REF,
    latest,
    targetDir: target.absolutePath,
  };
}
