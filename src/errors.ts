import pc from "picocolors";

export class UserAbortError extends Error {
  constructor(message = "Cancelled.") {
    super(message);
    this.name = "UserAbortError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ScaffoldError extends Error {
  readonly hint?: string;
  constructor(message: string, hint?: string) {
    super(message);
    this.name = "ScaffoldError";
    this.hint = hint;
  }
}

export class TemplateFetchError extends ScaffoldError {
  readonly source: string;
  constructor(message: string, source: string, hint?: string) {
    super(message, hint);
    this.name = "TemplateFetchError";
    this.source = source;
  }
}

export function handleError(err: unknown): never {
  if (err instanceof UserAbortError) {
    console.log(pc.yellow("\n× ") + err.message);
    process.exit(130);
  }
  if (err instanceof ValidationError) {
    console.error(pc.red("✗ ") + err.message);
    process.exit(1);
  }
  if (err instanceof ScaffoldError) {
    console.error(pc.red("✗ ") + err.message);
    if (err.hint) console.error(pc.dim(`  ${err.hint}`));
    process.exit(1);
  }
  console.error(
    pc.red("✗ Unexpected error: ") + (err instanceof Error ? err.message : String(err)),
  );
  if (err instanceof Error && err.stack) console.error(pc.dim(err.stack));
  process.exit(1);
}
