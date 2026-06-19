import { UserAbortError } from "../errors.js";
import { TEMPLATES, type Template } from "../types.js";
import { select, isCancel } from "@clack/prompts";

const LABELS: Record<Template, string> = {
  vuejs: "VueJS · Pinia · TanStack Query · Reka UI",
  nuxtjs: "NuxtJS · Pinia · TanStack Query · Reka UI",
  reactjs: "ReactJS · TanStack Router · TanStack Query · Zustand · shadcn/ui",
  nextjs: "NextJS · App Router · TanStack Query · Zustand · shadcn/ui",
  "tanstack-start": "TanStack Start · TanStack Query · Zustand · shadcn/ui",
  express: "Express · Mongoose · Socket.io · JWT · Redis · Postman",
  nestjs: "NestJS · Mongoose · Socket.io · JWT · Redis · Swagger",
};

export async function promptTemplate(): Promise<Template> {
  const result = await select<Template>({
    message: "Pick a template",
    options: TEMPLATES.map((t) => ({ value: t, label: LABELS[t] })),
  });
  if (isCancel(result)) throw new UserAbortError();
  return result;
}
