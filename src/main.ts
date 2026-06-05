import { resolveOptions } from "./options-resolver.js";
import { runScaffold } from "./runtime/run-scaffold.js";
import {
  DEFAULT_REF,
  PACKAGE_MANAGERS,
  TEMPLATES,
  type PackageManager,
  type Template,
} from "./types.js";
import { defineCommand } from "citty";
import pkg from "../package.json" with { type: "json" };

export const main = defineCommand({
  meta: {
    name: "create-prism-app",
    version: pkg.version,
    description: pkg.description,
  },
  args: {
    projectName: {
      type: "positional",
      required: false,
      description: "Project name / target directory",
    },
    name: {
      type: "string",
      description: "Project name (overrides positional)",
    },
    template: {
      type: "string",
      description: `Template (${TEMPLATES.join(" | ")})`,
    },
    pm: {
      type: "string",
      description: `Package manager (${PACKAGE_MANAGERS.join(" | ")})`,
    },
    git: {
      type: "boolean",
      description: "Initialize a git repository (use --no-git to skip)",
    },
    install: {
      type: "boolean",
      description: "Install dependencies (use --no-install to skip)",
    },
    force: {
      type: "boolean",
      description: "Overwrite a non-empty target directory",
    },
    ref: {
      type: "string",
      description: `Template ref (branch or commit; default: ${DEFAULT_REF})`,
    },
    latest: {
      type: "boolean",
      description:
        "Upgrade every dependency to its absolute latest before install (runs npm-check-updates)",
    },
    harness: {
      type: "boolean",
      description:
        "Install the optional repository-harness durable CLI after scaffold (downloads a per-OS binary)",
    },
  },
  async run({ args }) {
    const resolved = await resolveOptions({
      name: (args.name as string | undefined) ?? (args.projectName as string | undefined),
      template: args.template as Template | undefined,
      pm: args.pm as PackageManager | undefined,
      git: args.git as boolean | undefined,
      install: args.install as boolean | undefined,
      force: args.force as boolean | undefined,
      ref: args.ref as string | undefined,
      latest: args.latest as boolean | undefined,
      harness: args.harness as boolean | undefined,
    });
    await runScaffold(resolved);
  },
});
