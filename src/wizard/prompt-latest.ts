import { UserAbortError } from "../errors.js";
import { confirm, isCancel } from "@clack/prompts";

export async function promptLatest(initial = true): Promise<boolean> {
  const result = await confirm({
    message: "Upgrade dependencies to their absolute latest before install?",
    initialValue: initial,
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
