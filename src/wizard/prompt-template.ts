import { UserAbortError } from "../errors.js";
import { TEMPLATES, type Template } from "../types.js";
import { select, isCancel } from "@clack/prompts";

const LABELS: Record<Template, string> = {
  vuejs: "VueJS · Pinia · Reka UI · Tailwind v4",
  nuxtjs: "NuxtJS · Pinia · Reka UI · Tailwind v4",
  reactjs: "ReactJS · TanStack Router · shadcn/ui · Tailwind v4",
  nextjs: "NextJS · App Router · shadcn/ui · Tailwind v4",
  "tanstack-start": "TanStack Start · shadcn/ui · Tailwind v4",
  express: "Express · Mongoose · Socket.io · JWT · Redis",
};

export async function promptTemplate(): Promise<Template> {
  const result = await select<Template>({
    message: "Pick a template",
    options: TEMPLATES.map((t) => ({ value: t, label: LABELS[t] })),
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
