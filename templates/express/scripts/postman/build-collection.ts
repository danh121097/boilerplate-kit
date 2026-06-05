/**
 * Pure builder: declarative route groups + collection config -> Postman v2.1 collection.
 *
 * No side effects, no network. Given the same inputs it always produces the same
 * object, so it is safe to diff and re-push on every file change.
 */
import type { RouteConfig, RouteGroup } from '@/types/routing';
import {
  CAPTURE_TOKENS_TEST_SCRIPT,
  COLLECTION_AUTH,
  COLLECTION_DESCRIPTION,
  COLLECTION_NAME,
  COLLECTION_VARIABLES,
  FOLDER_TITLES,
  HMAC_PREREQUEST_SCRIPT
} from './route-metadata';
import { schemaToExampleJson } from './schema-to-example';

// Keep in sync with the app's config.apiPrefix via the same env var.
const API_PREFIX = process.env.API_PREFIX || '/api/v1';

/** Title-case a prefix as a fallback folder name (e.g. '/orders' -> 'Orders'). */
function folderTitle(prefix: string): string {
  if (FOLDER_TITLES[prefix]) return FOLDER_TITLES[prefix];
  const slug = prefix.replace(/^\//, '') || 'general';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** Verb used when the path itself names no action (e.g. `/` or `/:id`). */
const METHOD_VERB: Record<string, string> = {
  get: 'get',
  post: 'create',
  put: 'update',
  patch: 'update',
  delete: 'delete'
};

/**
 * Derive a readable request name from method + path (no `METHOD ` prefix).
 *   /register        -> "Register"        (path names the action)
 *   /update/avatar   -> "Update avatar"
 *   /  (GET)         -> "List"            (collection root)
 *   /:id (GET)       -> "Get by id"       (path is only a param)
 *   /:id (DELETE)    -> "Delete by id"
 */
function routeName(method: string, routePath: string): string {
  const parts = routePath.split('/').filter(Boolean);
  const allParams = parts.length > 0 && parts.every((p) => p.startsWith(':'));

  const words: string[] = [];
  for (const p of parts) {
    if (p.startsWith(':')) words.push('by', p.slice(1));
    else words.push(p.replace(/[-_]/g, ' '));
  }
  let phrase = words.join(' ').trim();

  if (!phrase) {
    phrase = method === 'get' ? 'list' : METHOD_VERB[method] ?? method;
  } else if (allParams) {
    const verb = method === 'get' ? 'get' : METHOD_VERB[method] ?? method;
    phrase = `${verb} ${phrase}`;
  }

  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/** Join group prefix + route path into the full server path, normalising slashes. */
function fullServerPath(prefix: string, routePath: string): string {
  const combined = `${API_PREFIX}${prefix}${routePath}`;
  const trimmed = combined.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Split a path into Postman url segments, keeping `:param` placeholders. */
function pathSegments(fullPath: string): string[] {
  return fullPath.split('/').filter((seg) => seg.length > 0);
}

function buildUrl(fullPath: string) {
  const segments = pathSegments(fullPath);
  const variables = segments
    .filter((seg) => seg.startsWith(':'))
    .map((seg) => ({ key: seg.slice(1), value: '' }));

  const url: Record<string, unknown> = {
    raw: `{{baseUrl}}${fullPath}`,
    host: ['{{baseUrl}}'],
    path: segments
  };
  if (variables.length) url.variable = variables;
  return url;
}

function buildItem(route: RouteConfig, prefix: string) {
  const upper = route.method.toUpperCase();
  const fullPath = fullServerPath(prefix, route.path);

  const request: Record<string, unknown> = {
    method: upper,
    header: [] as object[],
    url: buildUrl(fullPath)
  };

  // Body example is derived from the route's own Zod schema — never hand-written.
  const bodyRaw = route.bodySchema
    ? schemaToExampleJson(route.bodySchema)
    : undefined;
  if (bodyRaw) {
    request.header = [{ key: 'Content-Type', value: 'application/json' }];
    request.body = { mode: 'raw', raw: bodyRaw };
  }

  return {
    name: routeName(route.method, route.path),
    request,
    response: []
  };
}

export interface NamedGroup {
  group: RouteGroup;
}

/** Build the full collection object from the live route groups (one folder per group). */
export function buildCollection(groups: RouteGroup[]) {
  const items = groups.map((group) => ({
    name: folderTitle(group.prefix),
    item: group.routes.map((route) => buildItem(route, group.prefix))
  }));

  return {
    info: {
      name: COLLECTION_NAME,
      description: COLLECTION_DESCRIPTION,
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
    },
    auth: COLLECTION_AUTH,
    // Expose apiPrefix so the pre-request script can strip it from the signed path.
    variable: [
      ...COLLECTION_VARIABLES,
      { key: 'apiPrefix', value: API_PREFIX, type: 'string' }
    ],
    event: [
      {
        listen: 'prerequest',
        script: { type: 'text/javascript', exec: HMAC_PREREQUEST_SCRIPT }
      },
      {
        listen: 'test',
        script: { type: 'text/javascript', exec: CAPTURE_TOKENS_TEST_SCRIPT }
      }
    ],
    item: items
  };
}
