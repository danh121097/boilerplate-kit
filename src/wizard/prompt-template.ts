import { UserAbortError } from "../errors.js";
import { TEMPLATES, type Template } from "../types.js";
import { select, isCancel } from "@clack/prompts";

const LABELS: Record<Template, string> = {
  vuejs: "VueJS · Pinia · Reka UI · Tailwind",
  nuxtjs: "NuxtJS · Pinia · Reka UI · Tailwind",
  reactjs: "ReactJS · TanStack Router · shadcn/ui · Tailwind",
  nextjs: "NextJS · App Router · shadcn/ui · Tailwind",
  "tanstack-start": "TanStack Start · shadcn/ui · Tailwind",
  express: "Express · Mongoose · Socket.io · JWT/HMAC · Redis",
};

export async function promptTemplate(): Promise<Template> {
  const result = await select<Template>({
    message: "Pick a template",
    options: TEMPLATES.map((t) => ({ value: t, label: LABELS[t] })),
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
