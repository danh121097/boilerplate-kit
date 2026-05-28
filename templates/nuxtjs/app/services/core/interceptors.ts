import type { AxiosError, AxiosInstance, AxiosResponse } from "axios";
import type { ApiResponseError, ApiService, HttpInterceptorSetup } from "./types";
import { clearAuthTokens } from "./auth-token-storage";
import { HeadersUtils } from "./headers-utils";

interface ResponseInterceptorOpts {
  clearUnauthorizedAuth: () => void;
  reloadOnUnauthorized: boolean;
  strictBlobError: boolean;
}

function createResponseInterceptor(opts: ResponseInterceptorOpts) {
  const { clearUnauthorizedAuth, reloadOnUnauthorized, strictBlobError } = opts;

  const onSuccess = (response: AxiosResponse) => {
    if (response.data instanceof Blob) {
      if (!strictBlobError || (response.status >= 200 && response.status < 300)) {
        return response.data;
      }
      return Promise.reject<ApiResponseError>({
        status: "error",
        error_code: response.status,
        error_message: response.statusText || "blob_error",
        message: response.statusText || "blob_error",
      });
    }
    // If the API returns an envelope, unwrap; otherwise pass through.
    if (response.data && typeof response.data === "object" && "status" in response.data) {
      if (response.data.status === "success") return response.data;
      if (response.data.error_code === 401) {
        clearUnauthorizedAuth();
        if (reloadOnUnauthorized) window.location.reload();
      }
      return Promise.reject<ApiResponseError>(response.data as ApiResponseError);
    }
    return response;
  };

  const onError = (error: AxiosError<ApiResponseError>) => {
    const errorData = error.response?.data ?? { message: error.message };
    if (error.response?.status === 401) {
      clearUnauthorizedAuth();
      if (reloadOnUnauthorized) window.location.reload();
    }
    if (error.code === "ERR_NETWORK" || error.code === "ERR_BLOCKED_BY_CLIENT") {
      console.error("Network error. Please check your internet connection.");
    }
    return Promise.reject<ApiResponseError>(errorData as ApiResponseError);
  };

  return [onSuccess, onError] as const;
}

export class ApiInterceptors implements HttpInterceptorSetup {
  setupRequestInterceptor(instance: AxiosInstance, service: ApiService): void {
    instance.interceptors.request.use(
      (config) => {
        config.serviceType = service;
        config.headers = HeadersUtils.setAuthHeaders(config);
        HeadersUtils.addAuthorizationHeader(config, service);
        return config;
      },
      (error) => Promise.reject(error instanceof Error ? error : new Error(String(error))),
    );
  }

  setupResponseInterceptor(instance: AxiosInstance): void {
    instance.interceptors.response.use(
      ...createResponseInterceptor({
        clearUnauthorizedAuth: clearAuthTokens,
        reloadOnUnauthorized: true,
        strictBlobError: true,
      }),
    );
  }
}
