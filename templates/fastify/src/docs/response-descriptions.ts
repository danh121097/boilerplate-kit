import { jsonSchemaTransform } from "fastify-type-provider-zod";
import type { SwaggerTransformObject } from "@fastify/swagger";

type SwaggerTransformArgs = Parameters<typeof jsonSchemaTransform>[0];
type DocsSchema = { docsResponses?: Record<string, string>; docsBodyOptional?: boolean };
type OperationObject = {
  requestBody?: { required?: boolean };
  responses?: Record<string, { description?: string; content?: unknown }>;
};

/** `method url` of routes whose body is optional; read by `docsTransformObject`. */
const optionalBodyRoutes = new Set<string>();

/**
 * Swagger transform that merges each route's `docsResponses` (status -> description)
 * into the generated OpenAPI responses, so every status is documented, not only 2xx.
 * Documentation only: it never changes runtime validation or serialization.
 */
export function docsTransform(args: SwaggerTransformArgs): ReturnType<typeof jsonSchemaTransform> {
  const result = jsonSchemaTransform(args);
  const docs = args.schema as DocsSchema | undefined;
  const schema = result.schema as { response?: Record<string, Record<string, unknown>> } | null;
  if (!docs || !schema) return result;

  if (docs.docsBodyOptional) {
    optionalBodyRoutes.add(`${String(args.route.method).toLowerCase()} ${args.route.url}`);
  }
  const response = (schema.response ??= {});
  for (const [status, description] of Object.entries(docs.docsResponses ?? {})) {
    response[status] = { ...(response[status] ?? {}), description };
  }
  return result;
}

/**
 * Final OpenAPI pass: mark optional request bodies as not required and drop the empty
 * schema Fastify attaches to description-only responses, matching the other templates.
 */
export const docsTransformObject: SwaggerTransformObject = (documentObject) => {
  if (!("openapiObject" in documentObject)) return documentObject.swaggerObject;
  const { openapiObject } = documentObject;
  const paths = (openapiObject.paths ?? {}) as Record<string, Record<string, OperationObject>>;
  for (const [path, operations] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(operations)) {
      const openapiPath = path.replace(/\{([^}]+)\}/g, ":$1");
      if (operation.requestBody && optionalBodyRoutes.has(`${method} ${openapiPath}`)) {
        operation.requestBody.required = false;
      }
      for (const response of Object.values(operation.responses ?? {})) {
        const content = response.content as
          Record<string, { schema?: Record<string, unknown> }> | undefined;
        const onlyDescription = Object.values(content ?? {}).every((media) => {
          const keys = Object.keys(media.schema ?? {});
          return keys.length === 0 || (keys.length === 1 && keys[0] === "description");
        });
        if (content && onlyDescription) delete response.content;
      }
    }
  }
  return openapiObject;
};
