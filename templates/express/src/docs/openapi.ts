import { config } from "@/config/environment";
import { z } from "zod";
import type { RouteConfig, RouteGroup, RouteParameter } from "@/types/routing";

interface JsonSchema {
  $schema?: string;
  enum?: unknown[];
  example?: unknown;
  format?: string;
  items?: JsonSchema;
  minimum?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  type?: string;
}

function exampleValue(key: string, schema: JsonSchema): unknown {
  if (schema.enum?.length) return schema.enum[0];

  const name = key.toLowerCase();
  if (schema.format === "email" || name.includes("email")) return "user@example.com";
  if (schema.type === "string" && name.includes("password")) return "Admin@123";
  if (schema.type === "string" && (name === "name" || name.endsWith("name"))) return "Sample User";
  if (schema.type === "integer" || schema.type === "number") return schema.minimum ?? 0;
  if (schema.type === "boolean") return true;
  if (schema.type === "array") return schema.items ? [exampleValue(name, schema.items)] : [];
  if (schema.type === "object") return objectExample(schema);
  return schema.type === "string" ? "string" : undefined;
}

function objectExample(schema: JsonSchema): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).flatMap(([key, property]) => {
      const value = exampleValue(key, property);
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function requestBody(route: RouteConfig): Record<string, unknown> | undefined {
  if (!route.bodySchema) return undefined;

  const schema = z.toJSONSchema(route.bodySchema, {
    io: "input",
    unrepresentable: "any",
  }) as JsonSchema;
  delete schema.$schema;

  return {
    required: route.bodyRequired ?? true,
    description: route.documentation.requestBodyDescription,
    content: {
      "application/json": {
        schema,
        example: objectExample(schema),
      },
    },
  };
}

function response(
  status: string,
  description: string,
  route: RouteConfig,
): Record<string, unknown> {
  const schema = route.documentation.responseSchemas?.[status];
  if (!schema) return { description };

  const jsonSchema = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as JsonSchema;
  delete jsonSchema.$schema;

  return {
    description,
    content: { "application/json": { schema: jsonSchema } },
  };
}

function joinPath(...parts: string[]): string {
  const joined = parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return `/${joined}`.replace(/:([^/]+)/g, "{$1}");
}

function pathParameters(path: string): RouteParameter[] {
  return [...path.matchAll(/:([^/]+)/g)].map(([, name]) => ({
    name,
    in: "path",
    description: `${name} path parameter`,
    required: true,
    schema: { type: "string" },
  }));
}

function operationParameters(route: RouteConfig): RouteParameter[] | undefined {
  const parameters = pathParameters(route.path);
  for (const parameter of route.documentation.parameters ?? []) {
    const existing = parameters.findIndex(
      (candidate) => candidate.name === parameter.name && candidate.in === parameter.in,
    );
    if (existing === -1) parameters.push(parameter);
    else parameters[existing] = parameter;
  }
  return parameters.length ? parameters : undefined;
}

function operation(route: RouteConfig): Record<string, unknown> {
  const docs = route.documentation;
  const operation: Record<string, unknown> = {
    summary: docs.summary,
    description: docs.description,
    tags: docs.tags,
    parameters: operationParameters(route),
    requestBody: requestBody(route),
    responses: Object.fromEntries(
      Object.entries(docs.responses).map(([status, description]) => [
        status,
        response(status, description, route),
      ]),
    ),
  };

  if (docs.bearerAuth) {
    operation.security = [{ bearerAuth: [] }];
  }

  return Object.fromEntries(Object.entries(operation).filter(([, value]) => value !== undefined));
}

export function createOpenApiDocument(groups: RouteGroup[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const group of groups) {
    for (const route of group.routes) {
      const path = joinPath(config.apiPrefix, group.prefix, route.path);
      paths[path] ??= {};
      paths[path][route.method] = operation(route);
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Express Starter API",
      description:
        "All API routes require HMAC signatures. In development, Swagger Try it out signs requests automatically; protected routes still require a Bearer token.",
      version: "1.0.0",
    },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
    paths,
  };
}
