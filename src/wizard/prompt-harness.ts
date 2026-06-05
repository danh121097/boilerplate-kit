import { UserAbortError } from "../errors.js";
import { confirm, isCancel } from "@clack/prompts";

export async function promptHarness(initial = false): Promise<boolean> {
  const result = await confirm({
    message: "Install the optional Harness durable CLI? (downloads a per-OS binary)",
    initialValue: initial,
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
