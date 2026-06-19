export const TEMPLATES = [
  "vuejs",
  "nuxtjs",
  "reactjs",
  "nextjs",
  "tanstack-start",
  "express",
  "nestjs",
] as const;
export type Template = (typeof TEMPLATES)[number];

export const PACKAGE_MANAGERS = ["pnpm", "bun", "yarn", "npm"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

export const DEFAULT_REF = "latest";

export interface PartialOptions {
  name?: string;
  template?: Template;
  pm?: PackageManager;
  git?: boolean;
  install?: boolean;
  force?: boolean;
  ref?: string;
  /** Run `npx npm-check-updates -u` before install so every dep resolves to its absolute latest. */
  latest?: boolean;
  /** Install the optional repository-harness durable CLI into the scaffold (downloads a per-OS binary). */
  harness?: boolean;
}

export interface ResolvedOptions {
  name: string;
  template: Template;
  pm: PackageManager;
  git: boolean;
  install: boolean;
  force: boolean;
  ref: string;
  latest: boolean;
  harness: boolean;
  targetDir: string;
}
