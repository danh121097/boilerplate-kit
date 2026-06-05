import { UserAbortError } from "../errors.js";
import { confirm, isCancel } from "@clack/prompts";

export async function promptGit(initial = true): Promise<boolean> {
  const result = await confirm({
    message: "Initialize a git repository?",
    initialValue: initial,
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
