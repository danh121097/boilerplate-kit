import { DEFAULT_REF, TEMPLATES, type Template } from "../types.js";

const REPO = "danh121097/boilerplate-kit";

export { DEFAULT_REF, TEMPLATES, type Template };

export function getSource(template: Template, ref: string = DEFAULT_REF): string {
  return `github:${REPO}/templates/${template}#${ref}`;
}
