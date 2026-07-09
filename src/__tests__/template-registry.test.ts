import { DEFAULT_REF, TEMPLATES, getSource } from "../fetcher/template-registry.js";
import { describe, expect, it } from "vitest";

describe("template-registry", () => {
  it("default ref is 'master'", () => {
    expect(DEFAULT_REF).toBe("master");
  });

  it("renders the expected giget spec for every template at the default ref", () => {
    for (const t of TEMPLATES) {
      expect(getSource(t)).toBe(`github:danh121097/boilerplate-kit/templates/${t}#master`);
    }
  });

  it("honours an explicit branch ref", () => {
    expect(getSource("vuejs", "main")).toBe(
      "github:danh121097/boilerplate-kit/templates/vuejs#main",
    );
  });

  it("honours an explicit SHA ref", () => {
    const sha = "a".repeat(40);
    expect(getSource("nextjs", sha)).toBe(
      `github:danh121097/boilerplate-kit/templates/nextjs#${sha}`,
    );
  });

  it("exports exactly the 8 known templates", () => {
    expect([...TEMPLATES]).toEqual([
      "vuejs",
      "nuxtjs",
      "reactjs",
      "nextjs",
      "tanstack-start",
      "react-native",
      "express",
      "nestjs",
    ]);
  });
});
