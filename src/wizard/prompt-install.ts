import { UserAbortError } from "../errors.js";
import { confirm, isCancel } from "@clack/prompts";

export async function promptInstall(initial = true): Promise<boolean> {
  const result = await confirm({
    message: "Install dependencies?",
    initialValue: initial,
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
