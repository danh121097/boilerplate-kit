import { UserAbortError } from "../errors.js";
import { PACKAGE_MANAGERS, type PackageManager } from "../types.js";
import { select, isCancel } from "@clack/prompts";

export async function promptPackageManager(initial?: PackageManager): Promise<PackageManager> {
  const result = await select<PackageManager>({
    message: "Package manager?",
    options: PACKAGE_MANAGERS.map((pm) => ({ value: pm, label: pm })),
    initialValue: initial,
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
