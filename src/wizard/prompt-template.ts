import { select, isCancel } from "@clack/prompts";
import { UserAbortError } from "../errors.js";
import { TEMPLATES, type Template } from "../types.js";

const LABELS: Record<Template, string> = {
  vuejs: "VueJS · Pinia · Reka UI · Tailwind",
  nuxtjs: "NuxtJS · Pinia · Reka UI · Tailwind",
  reactjs: "ReactJS · TanStack Router · shadcn/ui · Tailwind",
  nextjs: "NextJS · App Router · shadcn/ui · Tailwind",
  "tanstack-start": "TanStack Start · shadcn/ui · Tailwind",
};

export async function promptTemplate(): Promise<Template> {
  const result = await select<Template>({
    message: "Pick a template",
    options: TEMPLATES.map((t) => ({ value: t, label: LABELS[t] })),
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
