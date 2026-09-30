import { loginSchema, refreshBodySchema, registerSchema } from "@/modules/auth/validation";

describe("auth Zod schemas", () => {
  it("registerSchema normalizes valid input", () => {
    const result = registerSchema.safeParse({
      email: "A@B.COM",
      password: "12345678",
      name: " Jo ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("a@b.com");
      expect(result.data.name).toBe("Jo");
    }
  });

  it("registerSchema rejects a whitespace-only name (trim before min)", () => {
    const result = registerSchema.safeParse({
      email: "a@b.com",
      password: "12345678",
      name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("registerSchema rejects invalid email", () => {
    const result = registerSchema.safeParse({ email: "bad", password: "12345678", name: "Jo" });
    expect(result.success).toBe(false);
  });

  it("registerSchema rejects a short password", () => {
    const result = registerSchema.safeParse({ email: "a@b.com", password: "short", name: "Jo" });
    expect(result.success).toBe(false);
  });

  it("loginSchema rejects empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("loginSchema lowercases the email", () => {
    const result = loginSchema.safeParse({ email: "A@B.COM", password: "x" });
    expect(result.success && result.data.email).toBe("a@b.com");
  });

  describe("refreshBodySchema", () => {
    // Fastify passes `null` to the validator when a request has no body (cookie-only clients).
    it("treats a missing (undefined or null) body as an empty object", () => {
      expect(refreshBodySchema.parse(undefined)).toEqual({});
      expect(refreshBodySchema.parse(null)).toEqual({});
    });

    it("accepts a string refreshToken, including the empty string", () => {
      expect(refreshBodySchema.parse({ refreshToken: "abc" })).toEqual({ refreshToken: "abc" });
      expect(refreshBodySchema.parse({ refreshToken: "" })).toEqual({ refreshToken: "" });
    });

    it.each([123, { a: 1 }, null, ["x"]])(
      "rejects a non-string refreshToken %j",
      (refreshToken) => {
        const result = refreshBodySchema.safeParse({ refreshToken });
        expect(result.success).toBe(false);
      },
    );
  });
});
