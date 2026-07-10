import { ESLintUtils, type TSESLint, type TSESTree } from "@typescript-eslint/utils";

/**
 * Sort the leading declaration block of a component/render function by category:
 *
 *   1. `let` / `var`                       — mutable bindings first
 *   2. `const x = call()`                  — plain identifier bindings
 *   3. `const { a } = ...`                  — object-destructured bindings
 *   4. `const [a] = ...`                    — array-destructured bindings (useState)
 *
 * Within the plain-const group (2), value bindings sort before function bindings
 * (`const isAuthenticated = ...` before `const navigate = useNavigate()`). That
 * distinction needs type information, so the rule uses the TypeScript type
 * checker: a binding whose type has a call signature is treated as a function.
 * If type services are unavailable the sub-order is skipped (source order kept).
 *
 * Only the *maximal leading run* of `VariableDeclaration` statements is touched;
 * lifecycle effects (`useEffect(...)`) and early returns are `ExpressionStatement`
 * / other nodes, so they break the run and keep their position.
 *
 * The reorder is a **lexicographic topological sort**: category/sub-key are soft
 * keys, but a declaration is NEVER moved above another declaration in the same
 * block that it references. That keeps handlers (`const onSubmit = handleSubmit(...)`)
 * below the values they depend on, so autofix cannot break behavior.
 *
 * Spacing: one blank line separates different categories; blank lines the source
 * already had between same-category declarations are preserved (so multi-line
 * helper functions keep their separation).
 *
 * Scope: every function body (components, hooks, plain utilities). Only the
 * leading declaration run is affected, so a function's first statement being a
 * non-declaration (guard clause, early return) leaves it untouched.
 *
 * The same value-before-function ordering is applied *inside* a `const { … }`
 * destructure (`{ isPending, mutateAsync }`). A trailing `...rest` is pinned
 * last; patterns with defaults or nested patterns are left untouched (a default
 * may reference a sibling binding, so reordering could break scope).
 */

type MessageIds = "unsorted" | "unsortedPattern";
type ParserServices = Extract<
  ReturnType<typeof ESLintUtils.getParserServices>,
  { getTypeAtLocation: unknown }
>;

const CATEGORY_LET = 1;
const CATEGORY_CONST_PLAIN = 2;
const CATEGORY_CONST_OBJECT = 3; // const { … }
const CATEGORY_CONST_ARRAY = 4; // const [ … ]

/** Narrow an arbitrary property value to an AST node. */
function isNode(value: unknown): value is TSESTree.Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

/** Category rank for a `VariableDeclaration` (lower sorts earlier). */
function categoryOf(decl: TSESTree.VariableDeclaration): number {
  if (decl.kind !== "const") return CATEGORY_LET; // let / var
  const idType = decl.declarations[0]?.id.type;
  if (idType === "ObjectPattern") return CATEGORY_CONST_OBJECT;
  if (idType === "ArrayPattern") return CATEGORY_CONST_ARRAY;
  return CATEGORY_CONST_PLAIN;
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
 * Collect identifier names referenced by an expression subtree. Deliberately
 * over-collects (extra deps only make the sort more conservative, never unsafe),
 * but skips non-computed member/property names to avoid the most common false
 * dependencies (e.g. `s.setUser`).
 */
function collectRefs(node: TSESTree.Node, out: Set<string>): void {
  if (node.type === "Identifier") {
    out.add(node.name);
    return;
  }
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    // `foo.bar` — `bar` is a member name, not a binding reference.
    if (node.type === "MemberExpression" && key === "property" && !node.computed) continue;
    // `{ bar: x }` / `class { bar() {} }` — `bar` key is not a reference.
    if (node.type === "Property" && key === "key" && !node.computed) continue;
    const value = record[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child)) collectRefs(child, out);
    } else if (isNode(value)) {
      collectRefs(value, out);
    }
  }
}

/** Resolve typed parser services, or null when full type info is unavailable. */
function resolveTypeServices(context: TSESLint.RuleContext<MessageIds, []>): ParserServices | null {
  try {
    return ESLintUtils.getParserServices(context);
  } catch {
    return null;
  }
}

const rule: TSESLint.RuleModule<MessageIds, []> = {
  defaultOptions: [],
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Sort a component's leading declarations by category (let → const → destructure).",
    },
    fixable: "code",
    schema: [],
    messages: {
      unsorted:
        "Component declarations should be grouped: let → const (value → function) → destructuring.",
      unsortedPattern: "Destructured value bindings should come before function bindings.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode;
    // Type services power the value-vs-function sub-order; absent them, skip it.
    const services = resolveTypeServices(context);

    /** A plain-const binding whose resolved type is callable is a function. */
    function isFunctionBinding(decl: TSESTree.VariableDeclaration): boolean {
      if (!services) return false;
      const id = decl.declarations[0]?.id;
      if (!id || id.type !== "Identifier") return false;
      return services.getTypeAtLocation(id).getCallSignatures().length > 0;
    }

    function checkBlock(block: TSESTree.BlockStatement): void {
      // Maximal leading run of variable declarations.
      const run: TSESTree.VariableDeclaration[] = [];
      for (const stmt of block.body) {
        if (stmt.type === "VariableDeclaration") run.push(stmt);
        else break;
      }
      if (run.length < 2) return;

      const categories = run.map(categoryOf);
      // Sub-key within the plain-const group: values (0) before functions (1).
      const subKeys = run.map((decl, i) =>
        categories[i] === CATEGORY_CONST_PLAIN && isFunctionBinding(decl) ? 1 : 0,
      );

      // name -> index of the declaration that binds it
      const boundBy = new Map<string, number>();
      run.forEach((decl, i) => {
        const names = new Set<string>();
        for (const d of decl.declarations) collectPatternNames(d.id, names);
        for (const name of names) boundBy.set(name, i);
      });

      // index -> set of indices it depends on (references within this block)
      const deps = run.map((decl, i) => {
        const refs = new Set<string>();
        for (const d of decl.declarations) if (d.init) collectRefs(d.init, refs);
        const result = new Set<number>();
        for (const name of refs) {
          const j = boundBy.get(name);
          if (j !== undefined && j !== i) result.add(j);
        }
        return result;
      });

      // Sort key = [category, subKey, originalIndex]; lower wins.
      const lessThan = (a: number, b: number): boolean =>
        categories[a]! < categories[b]! ||
        (categories[a] === categories[b] &&
          (subKeys[a]! < subKeys[b]! || (subKeys[a] === subKeys[b] && a < b)));

      // Lexicographic topological sort respecting dependencies.
      const n = run.length;
      const done = new Array<boolean>(n).fill(false);
      const order: number[] = [];
      for (let step = 0; step < n; step++) {
        let best = -1;
        for (let i = 0; i < n; i++) {
          if (done[i]) continue;
          let ready = true;
          for (const dep of deps[i]!) {
            if (!done[dep]) {
              ready = false;
              break;
            }
          }
          if (!ready) continue;
          if (best === -1 || lessThan(i, best)) best = i;
        }
        if (best === -1) return; // dependency cycle — leave the code untouched
        done[best] = true;
        order.push(best);
      }

      const indent = " ".repeat(run[0]!.loc.start.column);

      // Only treat a comment as "leading" if it sits on its own line, so we
      // don't drag a trailing `// note` onto the next statement.
      const ownLineComments = (node: TSESTree.Node): TSESTree.Comment[] =>
        sourceCode.getCommentsBefore(node).filter((c) => {
          const prev = sourceCode.getTokenBefore(c, { includeComments: true });
          return !prev || prev.loc.end.line !== c.loc.start.line;
        });

      // Whether a declaration had a blank line before it (before its own
      // comments) in the source — used to preserve intentional spacing between
      // same-category declarations (e.g. multi-line helper functions).
      const hasBlankBefore = (node: TSESTree.Node): boolean => {
        const comments = ownLineComments(node);
        const anchor: TSESTree.Node | TSESTree.Comment = comments[0] ?? node;
        const prev = sourceCode.getTokenBefore(anchor, { includeComments: true });
        return prev ? anchor.loc.start.line - prev.loc.end.line >= 2 : false;
      };

      // A statement's own-line comments + its own text, re-indented as one block.
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

      // Rebuild the block: one blank line between different categories, and keep
      // any blank line the source already had between same-category statements.
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

      // Report when either order OR category spacing differs from the source.
      if (output === sourceCode.text.slice(regionStart, regionEnd)) return;

      context.report({
        node: firstNode,
        messageId: "unsorted",
        fix: (fixer) => fixer.replaceTextRange([regionStart, regionEnd], output),
      });
    }

    function checkFunction(
      node:
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression,
    ): void {
      if (node.body.type === "BlockStatement") {
        checkBlock(node.body);
      }
    }

    // Order `const { value, fn } = ...` so value bindings precede function ones.
    function checkObjectPattern(pattern: TSESTree.ObjectPattern): void {
      const svc = services;
      if (!svc) return; // need types to tell a value from a function
      // Only the destructure of a variable declarator, e.g. `const { a } = x`.
      if (pattern.parent.type !== "VariableDeclarator" || pattern.parent.id !== pattern) return;

      const props = pattern.properties;
      if (props.length < 2) return;

      // Allow only a trailing `...rest`; anything else with a rest is left alone.
      const rest = props[props.length - 1];
      const hasRest = rest?.type === "RestElement";
      if (props.some((p, i) => p.type === "RestElement" && i !== props.length - 1)) return;
      const sortable = hasRest ? props.slice(0, -1) : props;

      // Simple identifier bindings only (no defaults/nesting → no sibling deps).
      if (!sortable.every((p) => p.type === "Property" && p.value.type === "Identifier")) return;

      const isFn = sortable.map((p) =>
        svc.getTypeAtLocation((p as TSESTree.Property).value).getCallSignatures().length > 0
          ? 1
          : 0,
      );
      const order = sortable.map((_, i) => i).sort((a, b) => isFn[a]! - isFn[b]! || a - b);
      if (order.every((v, i) => v === i)) return;

      const parts = order.map((i) => sourceCode.getText(sortable[i]!));
      if (hasRest) parts.push(sourceCode.getText(rest!));

      context.report({
        node: pattern,
        messageId: "unsortedPattern",
        fix: (fixer) => fixer.replaceText(pattern, `{ ${parts.join(", ")} }`),
      });
    }

    return {
      FunctionDeclaration: checkFunction,
      FunctionExpression: checkFunction,
      ArrowFunctionExpression: checkFunction,
      ObjectPattern: checkObjectPattern,
    };
  },
};

export default rule;
