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
 *
 * Safety: dependencies include JSX usage (`<Foo />` depends on `Foo`), comments
 * (leading own-line and same-line trailing) travel with their statement, and an
 * initializer that mutates or suspends (`n++`, `x = …`, `await …`) is a barrier
 * nothing may cross. When a sorted order exists but the rewrite cannot be proven
 * safe (a barrier would move, a comment would be lost), the rule still reports
 * but offers no autofix.
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
  // `<Foo />` / `<Foo.Bar />` reference the `Foo` binding just like `Foo` in code
  // does — missing them would let the sort hoist JSX above the component it
  // renders (a TDZ ReferenceError at runtime).
  if (node.type === "Identifier" || node.type === "JSXIdentifier") {
    out.add(node.name);
    return;
  }
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    // `foo.bar` — `bar` is a member name, not a binding reference.
    if (node.type === "MemberExpression" && key === "property" && !node.computed) continue;
    // `<Foo.Bar />` — only the root `Foo` is a binding; `Bar` is a member name.
    if (node.type === "JSXMemberExpression" && key === "property") continue;
    // `<div onClick={…} />` — the attribute name is not a binding reference.
    if (node.type === "JSXAttribute" && key === "name") continue;
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

const HOOK_NAME = /^use[A-Z0-9]/;

/** `useX(…)` / `Obj.useX(…)` — a React hook call, treated as order-independent. */
function isHookCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  if (callee.type === "Identifier") return HOOK_NAME.test(callee.name);
  return (
    callee.type === "MemberExpression" &&
    callee.property.type === "Identifier" &&
    HOOK_NAME.test(callee.property.name)
  );
}

/**
 * Whether an initializer may have a side effect at declaration time: `x++`,
 * `x = …`, `delete o.k`, `await …`, `yield …`, `new …`, a tagged template, or any
 * call (including an IIFE) other than a hook call. Moving such a declaration
 * across another one can change what either observes, so these act as barriers
 * (the rule still reports, but offers no autofix). Hook calls are assumed
 * order-independent — reordering them is the whole point of the rule — though
 * their arguments are still inspected. Nested function bodies are skipped: they
 * do not run at declaration time.
 */
function hasSideEffect(node: TSESTree.Node): boolean {
  switch (node.type) {
    case "UpdateExpression":
    case "AssignmentExpression":
    case "AwaitExpression":
    case "YieldExpression":
    case "NewExpression":
    case "TaggedTemplateExpression":
      return true;
    case "CallExpression":
      if (!isHookCall(node)) return true;
      break;
    case "UnaryExpression":
      if (node.operator === "delete") return true;
      break;
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "FunctionDeclaration":
      return false;
  }
  const record = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const value = record[key];
    if (Array.isArray(value)) {
      for (const child of value) if (isNode(child) && hasSideEffect(child)) return true;
    } else if (isNode(value) && hasSideEffect(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Lexicographic topological sort: repeatedly emit the smallest (by `lessThan`)
 * item whose dependencies are all emitted. Returns null on a dependency cycle.
 */
function topologicalOrder(
  n: number,
  deps: ReadonlyArray<ReadonlySet<number>>,
  lessThan: (a: number, b: number) => boolean,
): number[] | null {
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
    if (best === -1) return null;
    done[best] = true;
    order.push(best);
  }
  return order;
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

      // Declarations whose initializer mutates/suspends must keep their position
      // relative to every other declaration (see `hasSideEffect`).
      const effectful = run.map((decl) =>
        decl.declarations.some((d) => d.init !== null && hasSideEffect(d.init)),
      );

      // Sort key = [category, subKey, originalIndex]; lower wins.
      const lessThan = (a: number, b: number): boolean =>
        categories[a]! < categories[b]! ||
        (categories[a] === categories[b] &&
          (subKeys[a]! < subKeys[b]! || (subKeys[a] === subKeys[b] && a < b)));

      const order = topologicalOrder(run.length, deps, lessThan);
      if (!order) return; // dependency cycle — leave the code untouched

      const indent = " ".repeat(run[0]!.loc.start.column);

      // Only treat a comment as "leading" if it sits on its own line, so we
      // don't drag a trailing `// note` onto the next statement.
      const ownLineComments = (node: TSESTree.Node): TSESTree.Comment[] =>
        sourceCode.getCommentsBefore(node).filter((c) => {
          const prev = sourceCode.getTokenBefore(c, { includeComments: true });
          return !prev || prev.loc.end.line !== c.loc.start.line;
        });

      // Comments that trail a statement on its last line (`const a = 1; // why`)
      // belong to that statement and must travel with it.
      const trailingComments = (node: TSESTree.Node): TSESTree.Comment[] =>
        sourceCode.getCommentsAfter(node).filter((c) => c.loc.start.line === node.loc.end.line);

      // Whether a declaration had a blank line before it (before its own
      // comments) in the source — used to preserve intentional spacing between
      // same-category declarations (e.g. multi-line helper functions).
      const hasBlankBefore = (node: TSESTree.Node): boolean => {
        const comments = ownLineComments(node);
        const anchor: TSESTree.Node | TSESTree.Comment = comments[0] ?? node;
        const prev = sourceCode.getTokenBefore(anchor, { includeComments: true });
        return prev ? anchor.loc.start.line - prev.loc.end.line >= 2 : false;
      };

      // Every comment the rebuilt text carries, by start offset — compared against
      // the region's comments so a fix can never silently drop one.
      const carried = new Set<number>();
      const commentText = (c: TSESTree.Comment): string => {
        carried.add(c.range[0]);
        return c.type === "Block" ? `/*${c.value}*/` : `//${c.value}`;
      };

      // A statement's own-line comments + its own text + its trailing comments,
      // re-indented as one block.
      const contentOf = (j: number): string => {
        const node = run[j]!;
        const leading = ownLineComments(node);
        const prefix = leading.length
          ? leading.map(commentText).join("\n" + indent) + "\n" + indent
          : "";
        const trailing = trailingComments(node);
        const suffix = trailing.length ? " " + trailing.map(commentText).join(" ") : "";
        return prefix + sourceCode.getText(node) + suffix;
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
      const lastNode = run[run.length - 1]!;
      const regionStart = ownLineComments(firstNode)[0]?.range[0] ?? firstNode.range[0];
      const regionEnd = trailingComments(lastNode).at(-1)?.range[1] ?? lastNode.range[1];

      // Report when either order OR category spacing differs from the source.
      if (output === sourceCode.text.slice(regionStart, regionEnd)) return;

      // Autofix only when it is provably behavior- and content-preserving: no
      // side-effecting initializer changes position relative to another
      // declaration, and every comment in the region survives the rebuild.
      const position = new Array<number>(order.length);
      order.forEach((original, sorted) => (position[original] = sorted));
      const movesEffect = effectful.some((isEffect, i) => {
        if (!isEffect) return false;
        return position.some((p, j) => j !== i && j < i !== p < position[i]!);
      });
      const dropsComment = sourceCode
        .getAllComments()
        .some(
          (c) => c.range[0] >= regionStart && c.range[1] <= regionEnd && !carried.has(c.range[0]),
        );

      context.report({
        node: firstNode,
        messageId: "unsorted",
        fix:
          movesEffect || dropsComment
            ? null
            : (fixer) => fixer.replaceTextRange([regionStart, regionEnd], output),
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

      // The pattern node's range also covers a type annotation
      // (`const { a, b }: Props = …`); rewrite only the braces so it survives.
      const closeBrace = pattern.typeAnnotation
        ? sourceCode.getTokenBefore(pattern.typeAnnotation)
        : sourceCode.getLastToken(pattern);
      const braces: [number, number] = [pattern.range[0], closeBrace?.range[1] ?? pattern.range[1]];
      // A comment inside the braces has no safe new home — report, don't fix.
      const hasInnerComment = sourceCode
        .getAllComments()
        .some((c) => c.range[0] >= braces[0] && c.range[1] <= braces[1]);

      context.report({
        node: pattern,
        messageId: "unsortedPattern",
        fix:
          hasInnerComment || closeBrace?.value !== "}"
            ? null
            : (fixer) => fixer.replaceTextRange(braces, `{ ${parts.join(", ")} }`),
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
