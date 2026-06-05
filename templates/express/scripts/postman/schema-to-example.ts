/**
 * Derive an example request body from a Zod schema — no hand-written duplicate.
 *
 * Uses Zod v4's native `z.toJSONSchema` (input side, so `.transform()` is kept as
 * its pre-transform shape) and walks the result. Field *names* drive readable
 * placeholders generically (any `email`/`password`/`name` field), so adding a
 * field to the schema makes it appear in Postman automatically.
 */
import { z } from 'zod';
import type { ZodType } from 'zod';

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  format?: string;
  enum?: unknown[];
  items?: JsonSchema;
  minimum?: number;
}

/** Readable placeholder for a single property based on its name, type and format. */
function exampleValue(key: string, schema: JsonSchema): unknown {
  if (schema.enum?.length) return schema.enum[0];

  const k = key.toLowerCase();
  if (schema.format === 'email' || k.includes('email'))
    return 'harrynguyen@admin.com';

  switch (schema.type) {
    case 'string':
      if (k.includes('password')) return 'Admin@123';
      if (k === 'name' || k.endsWith('name')) return 'Harry Nguyen';
      if (k.includes('id')) return '665f1a2b3c4d5e6f7a8b9c0d';
      return 'string';
    case 'integer':
    case 'number':
      return schema.minimum ?? 0;
    case 'boolean':
      return true;
    case 'array':
      return schema.items ? [exampleValue(key, schema.items)] : [];
    case 'object':
      return buildObject(schema);
    default:
      return 'string';
  }
}

function buildObject(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    out[key] = exampleValue(key, prop);
  }
  return out;
}

/** Convert a Zod object schema into a pretty JSON example string, or undefined. */
export function schemaToExampleJson(schema: ZodType): string | undefined {
  try {
    const js = z.toJSONSchema(schema, {
      io: 'input',
      unrepresentable: 'any'
    }) as JsonSchema;
    if (js.type !== 'object' || !js.properties) return undefined;
    return JSON.stringify(buildObject(js), null, 2);
  } catch {
    return undefined;
  }
}
