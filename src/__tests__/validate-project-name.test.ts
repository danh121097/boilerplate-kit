import { validateProjectName } from "../validators/validate-project-name.js";
import { describe, it, expect } from "vitest";

describe("validateProjectName", () => {
  it("accepts a valid lowercase slug", () => {
    const v = validateProjectName("my-app");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.name).toBe("my-app");
  });

  it("trims surrounding whitespace", () => {
    const v = validateProjectName("  hello  ");
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.name).toBe("hello");
  });

  it("rejects an empty string", () => {
    expect(validateProjectName("").ok).toBe(false);
    expect(validateProjectName("   ").ok).toBe(false);
  });

  it("rejects uppercase characters", () => {
    expect(validateProjectName("MyApp").ok).toBe(false);
  });

  it("rejects names with path separators", () => {
    expect(validateProjectName("a/b").ok).toBe(false);
    expect(validateProjectName("a\\b").ok).toBe(false);
  });

  it("rejects '.' and '..'", () => {
    expect(validateProjectName(".").ok).toBe(false);
    expect(validateProjectName("..").ok).toBe(false);
  });

  it("rejects scoped names (path-separator policy)", () => {
    expect(validateProjectName("@scope/pkg").ok).toBe(false);
  });

  it("rejects npm-reserved names", () => {
    expect(validateProjectName("node_modules").ok).toBe(false);
    expect(validateProjectName("favicon.ico").ok).toBe(false);
  });
});
