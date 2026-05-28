import { ValidationError } from "../errors.js";

// Allowed: letters, digits, '.', '_', '-', '/'. 1-200 chars. Rejects shell
// metacharacters, spaces, control chars, '#', ':', etc. before interpolation.
const REF_RE = /^[A-Za-z0-9._/-]{1,200}$/;

export function validateRef(ref: string): void {
  if (typeof ref !== "string" || ref.length === 0) {
    throw new ValidationError("Template ref cannot be empty.");
  }
  if (ref.length > 200) {
    throw new ValidationError(`Template ref is too long (${ref.length} > 200).`);
  }
  if (!REF_RE.test(ref)) {
    throw new ValidationError(
      "Template ref contains invalid characters " +
        "(allowed: letters, digits, '.', '_', '-', '/').",
    );
  }
  const segments = ref.split("/");
  if (segments.some((seg) => seg === "" || /^\.+$/.test(seg))) {
    throw new ValidationError("Template ref must not contain empty or dot-only segments.");
  }
}
