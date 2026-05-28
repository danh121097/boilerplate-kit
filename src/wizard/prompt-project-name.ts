import { text, isCancel } from "@clack/prompts";
import { UserAbortError } from "../errors.js";
import { validateProjectName } from "../validators/validate-project-name.js";

export async function promptProjectName(defaultValue = "my-app"): Promise<string> {
  const result = await text({
    message: "Project name?",
    placeholder: defaultValue,
    defaultValue,
    validate(raw) {
      const value = raw ?? "";
      const candidate = value.trim() === "" ? defaultValue : value;
      const v = validateProjectName(candidate);
      return v.ok ? undefined : v.reason;
    },
  });
  if (isCancel(result)) throw new UserAbortError();
  const final = String(result).trim();
  return final === "" ? defaultValue : final;
}
