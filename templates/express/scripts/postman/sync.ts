/**
 * Entry point: regenerate the Postman collection from live routes, write it to
 * disk, and (if POSTMAN_API_KEY is set) push it to Postman cloud.
 *
 * One-shot:    bun scripts/postman/sync.ts
 * Real-time:   bun --watch scripts/postman/sync.ts
 *
 * Under `--watch`, Bun re-executes this file whenever any imported module
 * changes — including the route group definitions in src/ — so editing a route
 * regenerates and re-pushes the collection automatically.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { RouteGroup } from '@/types/routing';

// Single source of truth: the same registry the Express app uses. Any route
// group registered in src/routes/index.ts is picked up automatically — no need
// to add imports here when a new module is created.
import { groups } from '@/routes/index';

import { buildCollection } from './build-collection';
import { buildEnvironment } from './build-environment';
import { pushCollection, pushEnvironment, type PushResult } from './push-to-postman';

// npm scripts run from the repo root, so cwd is the project root.
const POSTMAN_DIR = join(process.cwd(), 'postman');
const COLLECTION_FILE = join(POSTMAN_DIR, 'postman_collection.json');
const ENVIRONMENT_FILE = join(POSTMAN_DIR, 'postman_environment.json');

function logResult(label: string, result: PushResult): void {
  if (result.pushed) {
    console.log(`[postman] ${result.action} ${label} on Postman (uid: ${result.uid})`);
  } else if (result.action === 'kept') {
    console.log(`[postman] kept ${label} (uid: ${result.uid}) — ${result.reason}`);
  } else {
    console.log(`[postman] skipped ${label} push: ${result.reason}`);
  }
}

async function sync(): Promise<void> {
  const collection = buildCollection(groups);
  const environment = buildEnvironment();

  mkdirSync(POSTMAN_DIR, { recursive: true });
  writeFileSync(COLLECTION_FILE, JSON.stringify(collection, null, 2) + '\n', 'utf8');
  writeFileSync(ENVIRONMENT_FILE, JSON.stringify(environment, null, 2) + '\n', 'utf8');

  const routeCount = groups.reduce(
    (n: number, g: RouteGroup) => n + g.routes.length,
    0
  );
  console.log(`[postman] wrote ${routeCount} routes -> ${COLLECTION_FILE}`);

  try {
    logResult('collection', await pushCollection(collection));
    logResult('environment', await pushEnvironment(environment));
  } catch (err) {
    console.error(`[postman] push failed: ${(err as Error).message}`);
  }
}

sync();
