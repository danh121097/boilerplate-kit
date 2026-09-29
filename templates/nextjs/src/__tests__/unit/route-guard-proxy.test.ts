import { STORAGE_KEYS } from "@/enums";
import { proxy } from "@/proxy";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

/** Route guard: the session hint cookie decides, before any profile fetch. */

function run(path: string, signedIn: boolean) {
  const headers = signedIn ? { cookie: `${STORAGE_KEYS.SESSION}=1` } : undefined;
  const response = proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  const location = response.headers.get("location");
  return location ? location.replace("http://localhost:3000", "") : null;
}

describe("route guard proxy", () => {
  it("guest on /users → /login with the original full path", () => {
    expect(run("/users", false)).toBe("/login?redirect=%2Fusers");
    expect(run("/users?page=2", false)).toBe("/login?redirect=%2Fusers%3Fpage%3D2");
  });

  it("signed-in user on /users passes through, even if the tokens have expired", () => {
    expect(run("/users", true)).toBeNull();
  });

  it("guest on /login passes through", () => {
    expect(run("/login?redirect=/users", false)).toBeNull();
  });

  it("signed-in user on /login → the safe redirect target, else home", () => {
    expect(run("/login?redirect=%2Fusers", true)).toBe("/users");
    expect(run("/login?redirect=https%3A%2F%2Fevil.example", true)).toBe("/");
    expect(run("/login?redirect=%2F%2Fevil.example", true)).toBe("/");
    expect(run("/login", true)).toBe("/");
  });
});
