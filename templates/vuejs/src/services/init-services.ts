import { Api, ApiInterceptors } from "./core";
import { registerServiceToken } from "./core/auth-token-storage";
import { STORAGE_KEYS } from "@/enums";

/**
 * Declare every backend the app talks to in one place. Each entry wires a
 * service's base URL together with the localStorage slot its bearer token
 * lives in.
 *
 * Add a backend = add a row + its `VITE_*_API_URL` in `.env`. Rows with an
 * empty baseURL are skipped, so optional services stay dormant until their
 * env var is set — no code change needed to toggle them on.
 */
interface ServiceDefinition {
  name: string;
  baseURL: string;
  tokenKey: string;
}

const SERVICES: ServiceDefinition[] = [
  {
    name: "MAIN",
    baseURL: import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com",
    tokenKey: STORAGE_KEYS.AUTH_TOKEN,
  },
];

export function initServices(): void {
  for (const svc of SERVICES) {
    if (!svc.baseURL) continue;
    Api.setBaseURL(svc.baseURL, svc.name);
    registerServiceToken(svc.name, svc.tokenKey);
  }
  Api.registerInterceptors(new ApiInterceptors());
}
