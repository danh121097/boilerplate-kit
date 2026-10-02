import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Files copied between templates must stay in sync, or a fix made in one template silently misses the
 * others. Each group names its canonical copy first: edit that one, then copy it over the rest. A group
 * with `normalize` compares ports (another test runner, the Vue flavour of TanStack Query) after mapping
 * each file to one form, so only the intended differences are allowed.
 */
const TEMPLATES = fileURLToPath(new URL("../../templates/", import.meta.url));

interface SharedGroup {
  name: string;
  files: string[];
  /** Template roots holding the files; the first is the canonical copy. */
  roots: string[];
  normalize?: (source: string) => string;
}

const REACT_ROOTS = ["tanstack-start/src", "reactjs/src", "react-native/src", "nextjs/src"];
const VUE_ROOTS = ["vuejs/src", "nuxtjs/app"];
const ALL_FRONTEND_ROOTS = [...REACT_ROOTS, ...VUE_ROOTS];
const BACKEND_ROOTS = ["express", "fastify"];

/** jest (react-native) → vitest: drop the vitest import, use `vi` for mocks. */
const asVitest = (source: string) =>
  source.replace(/^import \{[^}]*\} from "vitest";\n/m, "").replaceAll("jest.", "vi.");

/** Vue Query → React Query names, for the ports whose logic is shared. */
const asReactQuery = (source: string) =>
  source
    .replaceAll("@tanstack/vue-query", "@tanstack/react-query")
    .replaceAll("UseMutationReturnType", "UseMutationResult")
    .replaceAll("MutationObserverOptions", "UseMutationOptions");

const GROUPS: SharedGroup[] = [
  {
    name: "React query core",
    files: [
      "services/core/tanstack.ts",
      "services/core/tanstack-mutation.ts",
      "services/core/tanstack-optimistic.ts",
    ],
    roots: REACT_ROOTS,
  },
  {
    name: "React query core tests",
    files: ["__tests__/unit/tanstack.test.ts"],
    roots: REACT_ROOTS,
    normalize: asVitest,
  },
  {
    name: "React route-loader prefetch",
    files: ["services/core/tanstack-prefetch.ts", "__tests__/unit/tanstack-prefetch.test.ts"],
    roots: ["tanstack-start/src", "reactjs/src"],
  },
  {
    name: "Vue query core",
    files: ["services/core/tanstack-mutation.ts", "services/core/tanstack-optimistic.ts"],
    roots: VUE_ROOTS,
  },
  {
    name: "Vue ports of the React mutation core",
    files: ["services/core/tanstack-mutation.ts", "services/core/tanstack-optimistic.ts"],
    roots: ["tanstack-start/src", "vuejs/src"],
    normalize: asReactQuery,
  },
  {
    // runtime-env.ts is left out on purpose: it reads each framework's own env source.
    name: "React cookie-mode auth core",
    files: [
      "services/core/hmac-signature.ts",
      "services/core/interceptors.ts",
      "services/core/refresh-token-manager.ts",
      "services/core/session.ts",
      "services/core/api-errors.ts",
      "services/core/types.ts",
      "services/core/auth-refresh-client.ts",
      "services/core/headers-utils.ts",
    ],
    roots: ["tanstack-start/src", "nextjs/src"],
  },
  {
    // Token-mode web clients (bearer + body tokens) share these; the cookie-mode copies differ on purpose.
    name: "Token-mode web transport",
    files: [
      "services/core/api.ts",
      "services/core/socket-connection.ts",
      "services/core/hmac-signature.ts",
      "services/core/interceptors.ts",
      "services/core/runtime-env.ts",
    ],
    roots: ["reactjs/src", "vuejs/src"],
  },
  {
    name: "Socket events enum",
    files: ["enums/socket-events.ts"],
    roots: ALL_FRONTEND_ROOTS,
  },
  {
    name: "Backend auth and HMAC",
    files: [
      "src/modules/auth/refresh-session.ts",
      "src/utils/hmac.ts",
      "src/models/refresh-token.ts",
    ],
    roots: BACKEND_ROOTS,
  },
];

function checksum(path: string, normalize?: (source: string) => string): string {
  const source = readFileSync(path, "utf8").replaceAll("\r\n", "\n");
  return createHash("sha256")
    .update(normalize ? normalize(source) : source)
    .digest("hex");
}

describe("template shared files", () => {
  for (const group of GROUPS) {
    const [canonical, ...copies] = group.roots;
    for (const file of group.files) {
      it(`${group.name}: ${file} matches ${canonical}`, () => {
        const expected = checksum(`${TEMPLATES}${canonical}/${file}`, group.normalize);
        const drifted = copies.filter(
          (root) => checksum(`${TEMPLATES}${root}/${file}`, group.normalize) !== expected,
        );
        expect(drifted, `port templates/${canonical}/${file} to these`).toEqual([]);
      });
    }
  }
});
