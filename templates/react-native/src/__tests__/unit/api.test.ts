import { ok } from "@/__tests__/helpers/http-mocks";
import { Api } from "@/services/core";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

describe("Api", () => {
  let captured: InternalAxiosRequestConfig | undefined;

  const capture: AxiosAdapter = async (config) => {
    captured = config;
    return ok(config, { hello: 1 });
  };

  beforeEach(() => {
    captured = undefined;
    Api.setBaseURL("http://main", "MAIN");
    Api.setBaseURL("http://admin", "ADMIN");
  });

  describe("base URL registry", () => {
    it("resolves per service with a MAIN default and empty fallback", () => {
      expect(Api.getBaseURL("MAIN")).toBe("http://main");
      expect(Api.getBaseURL("ADMIN")).toBe("http://admin");
      expect(Api.getBaseURL()).toBe("http://main"); // default MAIN
      expect(Api.getBaseURL("UNKNOWN")).toBe(""); // fallback
    });
  });

  describe("request routing", () => {
    it("sends GET to the path with the resolved baseURL and credentials", async () => {
      await new Api({ path: "/items" }).get({ adapter: capture });
      expect(captured?.method).toBe("get");
      expect(captured?.url).toBe("/items");
      expect(captured?.baseURL).toBe("http://main");
      expect(captured?.withCredentials).toBe(true);
    });

    it("routes the second service to its own baseURL", async () => {
      await new Api({ path: "/x", service: "ADMIN" }).get({ adapter: capture });
      expect(captured?.baseURL).toBe("http://admin");
    });

    it("sends POST with a url override and serialized body", async () => {
      await new Api({ path: "/items" }).post({ url: "/items/1", data: { a: 1 }, adapter: capture });
      expect(captured?.method).toBe("post");
      expect(captured?.url).toBe("/items/1");
      expect(captured?.data).toBe(JSON.stringify({ a: 1 }));
    });

    it("merges customHeaders into the request", async () => {
      await new Api({ path: "/items" }).post({
        customHeaders: { "X-Trace": "42" },
        adapter: capture,
      });
      expect(String(captured?.headers["X-Trace"])).toBe("42");
    });

    it("postFormData routes as POST", async () => {
      await new Api({ path: "/up" }).postFormData({ data: {}, adapter: capture });
      expect(captured?.method).toBe("post");
    });
  });
});
