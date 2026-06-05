/**
 * Push Postman resources (collection + environment) to Postman cloud via the API.
 *
 * First push (no stored uid) -> POST (create), uid persisted to a cache file.
 * Subsequent pushes -> PUT /{resource}/{uid} (update in place), so the same
 * resource — and its auto-generated docs — updates live.
 *
 * Auth: POSTMAN_API_KEY env var. Optional POSTMAN_WORKSPACE_ID picks a workspace
 * on first create. Per-resource uid is cached under postman/ (gitignored) and an
 * env var override (e.g. POSTMAN_COLLECTION_UID) takes precedence.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const API_BASE = 'https://api.getpostman.com';
const POSTMAN_DIR = join(process.cwd(), 'postman'); // npm scripts run from repo root

/** Describes one Postman resource type and where its uid is cached/overridden. */
interface ResourceSpec {
  /** Body wrapper key + API path segment, e.g. 'collection' -> /collections. */
  kind: 'collection' | 'environment';
  endpoint: string;
  uidFile: string;
  uidEnvVar: string;
  /**
   * Whether to overwrite an already-created resource on later syncs.
   * Collection is code-derived (always update). Environment holds user-entered
   * config (secret, baseUrl) — created once, then left untouched so a re-sync
   * never wipes the values the user typed in Postman.
   */
  updateExisting: boolean;
}

const COLLECTION_SPEC: ResourceSpec = {
  kind: 'collection',
  endpoint: '/collections',
  uidFile: join(POSTMAN_DIR, '.collection-uid'),
  uidEnvVar: 'POSTMAN_COLLECTION_UID',
  updateExisting: true
};

const ENVIRONMENT_SPEC: ResourceSpec = {
  kind: 'environment',
  endpoint: '/environments',
  uidFile: join(POSTMAN_DIR, '.environment-uid'),
  uidEnvVar: 'POSTMAN_ENVIRONMENT_UID',
  // Normally never overwrite the user's env. Opt in with POSTMAN_PUSH_HMAC_SECRET
  // to force a re-push that seeds baseUrl/hmacSecret from .env (one-time setup).
  updateExisting: process.env.POSTMAN_PUSH_HMAC_SECRET === 'true'
};

function readStoredUid(spec: ResourceSpec): string | undefined {
  const fromEnv = process.env[spec.uidEnvVar]?.trim();
  if (fromEnv) return fromEnv;
  if (existsSync(spec.uidFile)) {
    const cached = readFileSync(spec.uidFile, 'utf8').trim();
    if (cached) return cached;
  }
  return undefined;
}

async function postmanRequest(
  method: 'POST' | 'PUT',
  path: string,
  apiKey: string,
  body: object
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Postman API ${method} ${path} failed (${res.status}): ${text}`);
  }
  return JSON.parse(text);
}

export interface PushResult {
  pushed: boolean;
  action?: 'created' | 'updated' | 'kept';
  uid?: string;
  reason?: string;
}

/** Create or update a single Postman resource; no-op if no API key is set. */
async function pushResource(
  spec: ResourceSpec,
  payload: object
): Promise<PushResult> {
  const apiKey = process.env.POSTMAN_API_KEY?.trim();
  if (!apiKey) {
    return { pushed: false, reason: 'POSTMAN_API_KEY not set — file written only' };
  }

  const body = { [spec.kind]: payload };
  const uid = readStoredUid(spec);

  if (uid) {
    // Already created. For user-config resources (environment) leave it alone so
    // a re-sync never overwrites the secret / values the user entered.
    if (!spec.updateExisting) {
      return { pushed: false, action: 'kept', uid, reason: 'exists — values preserved' };
    }
    const res = await postmanRequest('PUT', `${spec.endpoint}/${uid}`, apiKey, body);
    const info = res[spec.kind] as { uid?: string } | undefined;
    return { pushed: true, action: 'updated', uid: info?.uid ?? uid };
  }

  const workspace = process.env.POSTMAN_WORKSPACE_ID?.trim();
  const createPath = workspace
    ? `${spec.endpoint}?workspace=${workspace}`
    : spec.endpoint;
  const res = await postmanRequest('POST', createPath, apiKey, body);
  const info = res[spec.kind] as { uid?: string } | undefined;
  if (info?.uid) writeFileSync(spec.uidFile, info.uid + '\n', 'utf8');
  return { pushed: true, action: 'created', uid: info?.uid };
}

export const pushCollection = (collection: object): Promise<PushResult> =>
  pushResource(COLLECTION_SPEC, collection);

export const pushEnvironment = (environment: object): Promise<PushResult> =>
  pushResource(ENVIRONMENT_SPEC, environment);
