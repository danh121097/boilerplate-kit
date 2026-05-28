import validateNpmName from "validate-npm-package-name";

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: string };

export function validateProjectName(input: string): NameValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "Project name cannot be empty." };
  }
  if (
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed === "." ||
    trimmed === ".."
  ) {
    return { ok: false, reason: "Project name must not contain path separators." };
  }
  const res = validateNpmName(trimmed);
  if (!res.validForNewPackages) {
    const errs = [...(res.errors ?? []), ...(res.warnings ?? [])];
    return { ok: false, reason: errs[0] ?? "Invalid npm package name." };
  }
  return { ok: true, name: trimmed };
}
