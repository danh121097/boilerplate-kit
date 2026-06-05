import { Api } from "./api";
import type { ApiService, ServiceConfig } from "./types";

/**
 * Base class for service models — subclass and call `Model.setup(config)` to wire
 * a domain-specific axios instance with the right baseURL + interceptors.
 */
export class Model {
  static api: Api;
  static path: string;
  static service: ApiService = "MAIN";

  static setup(config: ServiceConfig): void {
    const service = config.service ?? this.service;
    this.service = service;
    this.api = new Api({ ...config, service });
    this.path = config.path;
  }
}
