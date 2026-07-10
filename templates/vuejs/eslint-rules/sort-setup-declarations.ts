import type { TSESLint, TSESTree } from "@typescript-eslint/utils";

/**
 * Sort the leading declaration block of a Vue `<script setup>` by role, matching
 * the documented section order:
 *
 *   1. props / emits   — defineProps, defineEmits, withDefaults, defineModel…
 *   2. composables     — const … = useX(…)
 *   3. const           — other plain constants
 *   4. refs            — ref, shallowRef, reactive, toRef(s), customRef…
 *   5. computed        — const … = computed(…)
 *   6. functions       — const fn = () => …, function fn() {}
 *
 * Categories are detected syntactically from the initializer's callee name (Vue
 * APIs are compiler-recognised identifiers), so no type information is needed —
 * which matters because `.vue` files are not part of the TS program.
 *
 * Applies to a `.vue` `<script setup>` (top level, after imports / type
 * declarations) AND to any function body (composables, Pinia setup stores,
 * handlers) in `.ts`/`.vue`. Only the leading run of declarations is touched;
 * the first non-declaration statement (a bare call, a lifecycle hook, an early
 * return) ends the run. Reordering is a dependency-safe topological
 * sort, so a declaration never moves above another it references. One blank line
 * separates different categories; blank lines within a category are preserved.
 */

type MessageIds = "unsorted";

const CAT_PROPS = 1;
const CAT_COMPOSABLE = 2;
const CAT_PLAIN = 3;
const CAT_REF = 4;
const CAT_COMPUTED = 5;
const CAT_FUNCTION = 6;

const PROPS_MACROS = new Set([
  "defineProps",
  "defineEmits",
  "withDefaults",
  "defineModel",
  "defineSlots",
  "defineExpose",
  "defineOptions",
]);
const REF_FACTORIES = new Set([
  "ref",
  "shallowRef",
  "toRef",
  "toRefs",
  "customRef",
  "reactive",
  "shallowReactive",
  "readonly",
  "shallowReadonly",
]);

/** Narrow an arbitrary property value to an AST node. */
function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/** Callee identifier name of a call expression, else null. */
function calleeName(node: TSESTree.Expression | null | undefined): string | null {
  if (!node || node.type !== "CallExpression") return null;
  return node.callee.type === "Identifier" ? node.callee.name : null;
}

/** Role rank for a leading `<script setup>` declaration (lower sorts earlier). */
function categoryOf(stmt: TSESTree.Node): number {
  if (stmt.type === "FunctionDeclaration") return CAT_FUNCTION;
  if (stmt.type !== "VariableDeclaration" || stmt.kind !== "const") return CAT_PLAIN;
  const init = stmt.declarations[0]?.init;
  if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
    return CAT_FUNCTION;
  }
  const name = calleeName(init);
  if (name) {
    if (PROPS_MACROS.has(name)) return CAT_PROPS;
    if (name === "computed") return CAT_COMPUTED;
    if (REF_FACTORIES.has(name)) return CAT_REF;
    if (/^use[A-Z]/.test(name)) return CAT_COMPOSABLE;
  }
  return CAT_PLAIN;
}

/** Collect every binding name introduced by a declarator's id pattern. */
function collectPatternNames(node: TSESTree.Node | null, out: Set<string>): void {
  if (!node) return;
  switch (node.type) {
    case "Identifier":
      out.add(node.name);
      break;
    case "ObjectPattern":
      for (const prop of node.properties) {
        if (prop.type === "RestElement") collectPatternNames(prop.argument, out);
        else collectPatternNames(prop.value, out);
      }
      break;
    case "ArrayPattern":
      for (const el of node.elements) collectPatternNames(el, out);
      break;
    case "AssignmentPattern":
      collectPatternNames(node.left, out);
      break;
    case "RestElement":
      collectPatternNames(node.argument, out);
      break;
  }
}

/**
 * Collect identifier names referenced by a subtree. Deliberately over-collects
 * (extra deps only make the sort more conservative, never unsafe), but skips
 * non-computed member/property names to avoid the most common false deps.
 */
function collectRefs(node: TSESTree.Node, out: Set<string>): void {
  if (node.type === "Identifier") {
    out.add(node.name);
    return;
  }
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    if (node.type === "MemberExpression" && key === "property" && !node.computed) continue;
    if (node.type === "Property" && key === "key" && !node.computed) continue;
    const value = record[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) collectRefs(child, out);
    } else if (isNode(value)) {
      collectRefs(value, out);
    }
  }
}

type Decl = TSESTree.VariableDeclaration | TSESTree.FunctionDeclaration;

/** Binding names a declaration introduces. */
function boundNamesOf(stmt: Decl, out: Set<string>): void {
  if (stmt.type === "FunctionDeclaration") {
    if (stmt.id) out.add(stmt.id.name);
    return;
  }
  for (const d of stmt.declarations) collectPatternNames(d.id, out);
}

/** Identifiers a declaration references (its initializer / body). */
function refsOf(stmt: Decl, out: Set<string>): void {
  if (stmt.type === "FunctionDeclaration") {
    if (stmt.body) collectRefs(stmt.body, out);
    return;
  }
  for (const d of stmt.declarations) if (d.init) collectRefs(d.init, out);
}

const rule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Sort a Vue <script setup>'s leading declarations by role (props → composables → const → ref → computed → functions).",
    },
    fixable: "code",
    schema: [],
    messages: {
      unsorted:
        "Vue <script setup> declarations should be grouped: props/emits → composables → const → ref → computed → functions.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;

    const isVue = context.filename.endsWith(".vue");

    function sortRun(run: Decl[]): void {
      if (run.length < 2) return;

      const categories = run.map(categoryOf);

      // name -> index of the declaration that binds it
      const boundBy = new Map<string, number>();
      run.forEach((stmt, idx) => {
        const names = new Set<string>();
        boundNamesOf(stmt, names);
        for (const name of names) boundBy.set(name, idx);
      });

      // index -> set of indices it depends on (references within this block)
      const deps = run.map((stmt, idx) => {
        const refs = new Set<string>();
        refsOf(stmt, refs);
        const result = new Set<number>();
        for (const name of refs) {
          const j = boundBy.get(name);
          if (j !== undefined && j !== idx) result.add(j);
        }
        return result;
      });

      const lessThan = (a: number, b: number): boolean =>
        categories[a]! < categories[b]! || (categories[a] === categories[b] && a < b);

      // Lexicographic topological sort respecting dependencies.
      const n = run.length;
      const done = new Array<boolean>(n).fill(false);
      const order: number[] = [];
      for (let step = 0; step < n; step++) {
        let best = -1;
        for (let k = 0; k < n; k++) {
          if (done[k]) continue;
          let ready = true;
          for (const dep of deps[k]!) {
            if (!done[dep]) {
              ready = false;
              break;
            }
          }
          if (!ready) continue;
          if (best === -1 || lessThan(k, best)) best = k;
        }
        if (best === -1) return; // dependency cycle — leave the code untouched
        done[best] = true;
        order.push(best);
      }

      const indent = " ".repeat(run[0]!.loc.start.column);

      const ownLineComments = (node: TSESTree.Node): TSESTree.Comment[] =>
        sourceCode.getCommentsBefore(node).filter((c) => {
          const prev = sourceCode.getTokenBefore(c, { includeComments: true });
          return !prev || prev.loc.end.line !== c.loc.start.line;
        });

      const hasBlankBefore = (node: TSESTree.Node): boolean => {
        const comments = ownLineComments(node);
        const anchor: TSESTree.Node | TSESTree.Comment = comments[0] ?? node;
        const prev = sourceCode.getTokenBefore(anchor, { includeComments: true });
        return prev ? anchor.loc.start.line - prev.loc.end.line >= 2 : false;
      };

      const contentOf = (j: number): string => {
        const node = run[j]!;
        const comments = ownLineComments(node);
        const prefix = comments.length
          ? comments
              .map((c) => (c.type === "Block" ? `/*${c.value}*/` : `//${c.value}`))
              .join("\n" + indent) +
            "\n" +
            indent
          : "";
        return prefix + sourceCode.getText(node);
      };

      let output = contentOf(order[0]!);
      for (let idx = 1; idx < order.length; idx++) {
        const cur = order[idx]!;
        const prev = order[idx - 1]!;
        const blank = categories[cur] !== categories[prev] || hasBlankBefore(run[cur]!);
        output += (blank ? "\n\n" : "\n") + indent + contentOf(cur);
      }

      const firstNode = run[0]!;
      const leadingOfFirst = ownLineComments(firstNode);
      const regionStart = leadingOfFirst[0]?.range[0] ?? firstNode.range[0];
      const regionEnd = run[run.length - 1]!.range[1];

      if (output === sourceCode.text.slice(regionStart, regionEnd)) return;

      context.report({
        node: firstNode,
        messageId: "unsorted",
        fix: (fixer) => fixer.replaceTextRange([regionStart, regionEnd], output),
      });
    }

    // Vue <script setup>: skip leading imports / type declarations, then sort the
    // run of value declarations. Only .vue — a .ts module top level is not setup.
    function checkProgram(body: TSESTree.Program["body"]): void {
      if (!isVue) return;
      const skippable = new Set([
        "ImportDeclaration",
        "TSInterfaceDeclaration",
        "TSTypeAliasDeclaration",
        "TSModuleDeclaration",
        "TSEnumDeclaration",
      ]);
      let i = 0;
      while (i < body.length && skippable.has(body[i]!.type)) i++;
      const run: Decl[] = [];
      for (; i < body.length; i++) {
        const s = body[i]!;
        if (s.type === "VariableDeclaration" || s.type === "FunctionDeclaration") run.push(s);
        else break;
      }
      sortRun(run);
    }

    // Any function body (composables, Pinia setup stores, handlers) — same order.
    function checkBlock(block: TSESTree.BlockStatement): void {
      const run: Decl[] = [];
      for (const s of block.body) {
        if (s.type === "VariableDeclaration" || s.type === "FunctionDeclaration") run.push(s);
        else break;
      }
      sortRun(run);
    }

    function checkFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): void {
      if (node.body.type === "BlockStatement") checkBlock(node.body);
    }

    return {
      Program: (node) => checkProgram(node.body),
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
    };
  },
};

export default rule;
