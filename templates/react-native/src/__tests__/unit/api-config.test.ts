import { getApiBaseUrl } from "@/services/core/api-config";

describe("api-config", () => {
  const KEYS = ["EXPO_PUBLIC_APP_ENDPOINT", "EXPO_PUBLIC_API_PREFIX"] as const;
  const snapshot: Record<string, string | undefined> = {};
  beforeEach(() => KEYS.forEach((k) => (snapshot[k] = process.env[k])));
  afterEach(() => {
    KEYS.forEach((k) => {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    });
  });

  it("composes the base URL from EXPO_PUBLIC_APP_ENDPOINT + EXPO_PUBLIC_API_PREFIX", () => {
    process.env.EXPO_PUBLIC_APP_ENDPOINT = "https://api.example.com";
    process.env.EXPO_PUBLIC_API_PREFIX = "/api/v2";
    expect(getApiBaseUrl()).toBe("https://api.example.com/api/v2");
  });

  it("falls back to localhost + /api/v1 when the env vars are unset", () => {
    delete process.env.EXPO_PUBLIC_APP_ENDPOINT;
    delete process.env.EXPO_PUBLIC_API_PREFIX;
    expect(getApiBaseUrl()).toBe("http://localhost:3000/api/v1");
  });
});
