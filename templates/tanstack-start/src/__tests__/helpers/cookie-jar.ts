import { vi } from "vitest";

/** A browser cookie jar behind `document.cookie` (name=value; attributes, `max-age=0` deletes). */
export function installCookieJar() {
  const jar = new Map<string, string>();
  const noop = () => {};
  vi.stubGlobal("window", { addEventListener: noop, removeEventListener: noop });
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(raw: string) {
      const [pair = "", ...attributes] = raw.split(";");

      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      if (attributes.some((a) => /^\s*max-age=0\s*$/i.test(a))) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1));
    },
    visibilityState: "visible",
    addEventListener: noop,
    removeEventListener: noop,
  });
  return jar;
}
