import { RuleTester } from "eslint";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import rule from "./sort-leading-declarations";
import tseslint from "typescript-eslint";

/**
 * Regression tests for the local sort-leading-declarations rule. The rule is
 * byte-identical across the reactjs / nextjs / tanstack-start / react-native
 * templates; these cases pin the autofix-safety guarantees (TDZ via JSX, comment
 * preservation, side-effect barriers, type-annotation preservation).
 */

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const rootDir = fileURLToPath(new URL("..", import.meta.url));

// Untyped: category ordering + dependency safety (no value/function sub-order).
const untyped = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

// Typed: needed for the destructure value-before-function ordering.
const typed = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      projectService: { allowDefaultProject: ["*.tsx"] },
      tsconfigRootDir: rootDir,
    },
  },
});

// The rule's meta types differ slightly from ESLint core's; the runtime shape is identical.
const ruleModule = rule as unknown as Parameters<RuleTester["run"]>[1];

untyped.run("sort-leading-declarations", ruleModule, {
  valid: [
    // Already sorted.
    "function f() {\n  let a = 1;\n\n  const b = 2;\n}",
    // JSX usage is a dependency: `el` renders `Item`, so it must stay below it.
    "function f() {\n  let count = 0;\n\n  const Item = () => null;\n\n  const { el } = { el: <Item /> };\n}",
    // A same-line trailing comment is not a reason to report sorted code.
    "function f() {\n  let a = 1; // why a\n\n  const b = 2; // why b\n}",
  ],
  invalid: [
    {
      // (a) `<Row />` depends on `Row`: the `let` may hoist, `rows` must not pass `Row`.
      code: [
        "function List() {",
        "  const Row = () => null;",
        "  const rows = <Row />;",
        "  let n = 0;",
        "}",
      ].join("\n"),
      output: [
        "function List() {",
        "  let n = 0;",
        "",
        "  const Row = () => null;",
        "  const rows = <Row />;",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (a) `<UI.Row />` — the JSXMemberExpression root `UI` is a dependency.
      code: [
        "function List() {",
        "  const [open] = useState(false);",
        "  const el = <UI.Row open={open} />;",
        "  const UI = { Row: () => null };",
        "}",
      ].join("\n"),
      output: [
        "function List() {",
        "  const UI = { Row: () => null };",
        "",
        "  const [open] = useState(false);",
        "",
        "  const el = <UI.Row open={open} />;",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (b) same-line trailing comments travel with their statement.
      code: ["function f() {", "  const b = 2; // why b", "  let a = 1; // why a", "}"].join("\n"),
      output: ["function f() {", "  let a = 1; // why a", "", "  const b = 2; // why b", "}"].join(
        "\n",
      ),
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (c) `counter++` is a side-effect barrier: report, but never autofix.
      code: ["function f() {", "  const first = counter;", "  let id = counter++;", "}"].join("\n"),
      output: null,
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (c) `await` is also a barrier.
      code: ["async function f() {", "  const cfg = await load();", "  let retries = 0;", "}"].join(
        "\n",
      ),
      output: null,
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (c) an IIFE hides the mutation inside a call: any non-hook call is a barrier.
      code: [
        "function f() {",
        "  const first = counter;",
        "  let id = (() => counter++)();",
        "}",
      ].join("\n"),
      output: null,
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (c) plain calls and `new` may have effects too.
      code: ["function f() {", "  const a = next();", "  let b = new Tracker();", "}"].join("\n"),
      output: null,
      errors: [{ messageId: "unsorted" }],
    },
    {
      // (c) a hook call is order-independent, but its arguments are still inspected.
      code: [
        "function f() {",
        "  const first = counter;",
        "  let [id] = useState(counter++);",
        "}",
      ].join("\n"),
      output: null,
      errors: [{ messageId: "unsorted" }],
    },
  ],
});

typed.run("sort-leading-declarations (typed)", ruleModule, {
  valid: [],
  invalid: [
    {
      // (d) reorder inside the braces; the `: Props` annotation must survive.
      filename: "fixture.tsx",
      code: [
        "type Props = { onSave: () => void; title: string };",
        "export function Card(props: Props) {",
        "  const { onSave, title }: Props = props;",
        "  return title ? onSave : null;",
        "}",
      ].join("\n"),
      output: [
        "type Props = { onSave: () => void; title: string };",
        "export function Card(props: Props) {",
        "  const { title, onSave }: Props = props;",
        "  return title ? onSave : null;",
        "}",
      ].join("\n"),
      errors: [{ messageId: "unsortedPattern" }],
    },
    {
      // (d) a comment inside the braces cannot be relocated safely — no fix.
      filename: "fixture.tsx",
      code: [
        "type Props = { onSave: () => void; title: string };",
        "export function Card(props: Props) {",
        "  const { onSave /* handler */, title }: Props = props;",
        "  return title ? onSave : null;",
        "}",
      ].join("\n"),
      output: null,
      errors: [{ messageId: "unsortedPattern" }],
    },
  ],
});
