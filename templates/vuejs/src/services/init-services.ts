import { Api, ApiInterceptors } from "./core";

export function initServices(): void {
  const baseURL =
    import.meta.env.VITE_API_BASE_URL ?? "https://jsonplaceholder.typicode.com";

  Api.setBaseURL(baseURL, "MAIN");
  Api.registerInterceptors(new ApiInterceptors());
}
