import axios, { type AxiosInstance } from "axios";
import type { ApiRequestConfig, ApiService, HttpInterceptorSetup, ServiceConfig } from "./types";

/**
 * Shared HTTP API client with multi-service support and injectable interceptors.
 * Register interceptors via Api.registerInterceptors() before any API calls.
 *
 * NOTE: This client is client-side only. In Next.js App Router, only call it
 * from "use client" components, client-side hooks, or useEffect. Never call it
 * during SSR/RSC — auth-token-storage is SSR-guarded but network calls from
 * the server bypass the browser cookie jar.
 */
export class Api {
  private static _interceptors: HttpInterceptorSetup | null = null;
  private static _baseURLs = new Map<string, string>();

  private http: AxiosInstance;
  private interceptorsApplied = false;
  private readonly path: string;
  private readonly service: ApiService;

  static setBaseURL(url: string, service: ApiService = "MAIN"): void {
    Api._baseURLs.set(service, url);
  }

  static getBaseURL(service: ApiService = "MAIN"): string {
    return Api._baseURLs.get(service) ?? "";
  }

  static registerInterceptors(interceptors: HttpInterceptorSetup): void {
    Api._interceptors = interceptors;
  }

  constructor(config: ServiceConfig) {
    this.path = config.path;
    this.service = config.service ?? "MAIN";
    this.http = axios.create({
      headers: { "Content-Type": "application/json", Accept: "*/*" },
      withCredentials: true,
      timeout: 30_000,
    });

    // Lazy baseURL resolver — set after Api instance construction via Api.setBaseURL().
    this.http.interceptors.request.use((req) => {
      if (!req.baseURL) req.baseURL = Api.getBaseURL(this.service);
      return req;
    });
  }

  private ensureInterceptors(): void {
    if (!this.interceptorsApplied && Api._interceptors) {
      Api._interceptors.setupRequestInterceptor(this.http, this.service);
      Api._interceptors.setupResponseInterceptor(this.http);
      this.interceptorsApplied = true;
    }
  }

  private async makeRequest<T>(
    method: "get" | "post" | "put" | "patch" | "delete",
    config: ApiRequestConfig = {},
  ) {
    this.ensureInterceptors();
    const { url = this.path, data, customHeaders, ...rest } = config;
    const finalConfig = customHeaders
      ? { ...rest, headers: { ...rest.headers, ...customHeaders } }
      : rest;

    if (method === "get" || method === "delete") {
      return await this.http[method]<T>(url, finalConfig);
    }
    return await this.http[method]<T>(url, data, finalConfig);
  }

  getServiceType(): ApiService {
    return this.service;
  }

  get<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("get", config);
  }
  post<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("post", config);
  }
  postFormData<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("post", {
      ...config,
      customHeaders: { "Content-Type": "multipart/form-data" },
    });
  }
  put<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("put", config);
  }
  patch<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("patch", config);
  }
  delete<T>(config: ApiRequestConfig = {}) {
    return this.makeRequest<T>("delete", config);
  }
}
