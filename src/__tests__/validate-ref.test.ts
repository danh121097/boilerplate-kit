import { ValidationError } from "../errors.js";
import { validateRef } from "../fetcher/validate-ref.js";
import { describe, expect, it } from "vitest";

describe("validateRef", () => {
  it("accepts common branch names", () => {
    expect(() => validateRef("main")).not.toThrow();
    expect(() => validateRef("latest")).not.toThrow();
    expect(() => validateRef("dev")).not.toThrow();
    expect(() => validateRef("feat/new-template")).not.toThrow();
    expect(() => validateRef("release-1.x")).not.toThrow();
  });

  it("accepts SHA-like refs", () => {
    expect(() => validateRef("a".repeat(40))).not.toThrow();
    expect(() => validateRef("0123456789abcdef")).not.toThrow();
  });

  it("accepts tags with dots", () => {
    expect(() => validateRef("v1.2.3")).not.toThrow();
    expect(() => validateRef("v0.0.1-alpha.4")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => validateRef("")).toThrow(ValidationError);
  });

  it("rejects whitespace anywhere", () => {
    expect(() => validateRef(" main")).toThrow(ValidationError);
    expect(() => validateRef("main ")).toThrow(ValidationError);
    expect(() => validateRef("mai n")).toThrow(ValidationError);
  });

  it("rejects shell metacharacters", () => {
    expect(() => validateRef("main;rm -rf /")).toThrow(ValidationError);
    expect(() => validateRef("a&b")).toThrow(ValidationError);
    expect(() => validateRef("a|b")).toThrow(ValidationError);
    expect(() => validateRef("a`b")).toThrow(ValidationError);
    expect(() => validateRef("a$b")).toThrow(ValidationError);
    expect(() => validateRef("a*b")).toThrow(ValidationError);
    expect(() => validateRef("a?b")).toThrow(ValidationError);
  });

  it("rejects '#' and ':' (giget spec delimiters)", () => {
    expect(() => validateRef("a#b")).toThrow(ValidationError);
    expect(() => validateRef("a:b")).toThrow(ValidationError);
  });

  it("rejects control characters", () => {
    expect(() => validateRef("a\nb")).toThrow(ValidationError);
    expect(() => validateRef("a\tb")).toThrow(ValidationError);
    expect(() => validateRef("a\x00b")).toThrow(ValidationError);
  });

  it("rejects refs longer than 200 chars", () => {
    expect(() => validateRef("a".repeat(201))).toThrow(ValidationError);
  });

  it("rejects empty or dot-only segments", () => {
    expect(() => validateRef("..")).toThrow(ValidationError);
    expect(() => validateRef("foo/../bar")).toThrow(ValidationError);
    expect(() => validateRef("foo//bar")).toThrow(ValidationError);
    expect(() => validateRef("/main")).toThrow(ValidationError);
    expect(() => validateRef("main/")).toThrow(ValidationError);
  });
});
