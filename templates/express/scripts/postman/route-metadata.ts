/**
 * Collection-level config for the auto-generated Postman collection.
 *
 * Routes (method, path, body schema) are read from the live route groups in
 * `src/`, so endpoints appear automatically with no per-endpoint config here.
 * This file only holds things route data cannot express: the collection
 * name/description/variables, folder titles, and the HMAC pre-request script.
 */

/** Collection-level pre-request script: signs every request like verifyHmacRequest expects. */
export const HMAC_PREREQUEST_SCRIPT: string[] = [
  '// Auto-sign every request with HMAC-SHA256 (Base64) to satisfy the server.',
  "// String to sign mirrors the client: [METHOD, CONTENT_TYPE, ctime, PATH, ''].join('\\n')",
  '// PATH excludes the API prefix and query string (server signs req.url pathname).',
  'const ctime = Date.now().toString();',
  'const method = pm.request.method.toUpperCase();',
  '',
  "let contentType = '';",
  'const body = pm.request.body;',
  "if (body && body.mode === 'raw' && body.raw && body.raw.toString().trim() !== '') {",
  "  contentType = 'application/json';",
  "  pm.request.headers.upsert({ key: 'Content-Type', value: 'application/json' });",
  '}',
  '',
  '// Resolve :path variables to their real values — a literal ":id" would never match.',
  'const url = pm.request.url;',
  'const segments = (url.path || []).map(function (seg) {',
  "  if (seg && seg.charAt(0) === ':') {",
  '    const pv = url.variables && url.variables.get && url.variables.get(seg.slice(1));',
  '    const val = pv && (pv.value != null ? pv.value : pv);',
  "    if (val != null && String(val) !== '') return String(val);",
  '  }',
  '  return seg;',
  '});',
  "let path = pm.variables.replaceIn('/' + segments.join('/'));",
  '',
  '// Strip the API prefix so the signed path matches the server (req.url is',
  '// already prefix-stripped by the app.use(apiPrefix, ...) mount). Query string',
  '// is intentionally NOT signed.',
  "const apiPrefix = pm.collectionVariables.get('apiPrefix') || pm.environment.get('apiPrefix') || '';",
  'if (apiPrefix && path.indexOf(apiPrefix) === 0) {',
  "  path = path.slice(apiPrefix.length) || '/';",
  '}',
  '',
  "const secret = pm.collectionVariables.get('hmacSecret') || pm.environment.get('hmacSecret') || '';",
  'if (!secret) {',
  "  console.warn('hmacSecret variable is empty — requests will fail HMAC verification.');",
  '}',
  '',
  "const stringToSign = [method, contentType, ctime, path, ''].join('\\n');",
  'const signature = CryptoJS.HmacSHA256(stringToSign, secret).toString(CryptoJS.enc.Base64);',
  '',
  "pm.request.headers.upsert({ key: 'ctime', value: ctime });",
  "pm.request.headers.upsert({ key: 'sig', value: signature });"
];

/**
 * Collection-level test script: runs after EVERY response. If the body carries
 * `data.tokens` (login/register/refresh do), it saves accessToken/refreshToken
 * to the active environment (or collection vars if no env is selected), so the
 * collection-level Bearer auth `{{accessToken}}` is populated automatically.
 */
export const CAPTURE_TOKENS_TEST_SCRIPT: string[] = [
  'try {',
  '  const json = pm.response.json();',
  '  const tokens = json && json.data && json.data.tokens;',
  '  if (tokens) {',
  '    const target = pm.environment.name ? pm.environment : pm.collectionVariables;',
  "    if (tokens.accessToken) target.set('accessToken', tokens.accessToken);",
  "    if (tokens.refreshToken) target.set('refreshToken', tokens.refreshToken);",
  "    console.log('[postman] saved tokens to ' + (pm.environment.name || 'collection'));",
  '  }',
  '} catch (e) {',
  '  // Non-JSON or no tokens — nothing to capture.',
  '}'
];

/** Collection-level Bearer auth — uses the captured access token. */
export const COLLECTION_AUTH = {
  type: 'bearer',
  bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }]
};

// Collection name comes from APP_NAME (loaded via dotenv before this module runs).
export const COLLECTION_NAME = `${process.env.APP_NAME || 'app'} API`;

export const COLLECTION_DESCRIPTION = [
  'Auto-generated from the declarative route definitions in `src/`.',
  '',
  '## Conventions',
  '- **Base path:** every endpoint is mounted under the `apiPrefix` variable.',
  '- **HMAC signing (required):** the collection-level pre-request script sets',
  '  `ctime` and `sig` on every request using the `hmacSecret` variable.',
  "  Signed string: `[METHOD, CONTENT_TYPE, ctime, PATH, ''].join('\\n')`",
  '  (HMAC-SHA256, Base64). PATH excludes the `apiPrefix` and query string.',
  '  Requests older than 5 minutes are rejected.',
  '- **Auth:** register/login/refresh set httpOnly `accessToken`/`refreshToken`',
  '  cookies; Postman replays them automatically. Bearer header also accepted.',
  '',
  '## Setup',
  '1. Select the generated environment (top-right) — `baseUrl` is preset.',
  '2. Set its `hmacSecret` value to match `HMAC_SECRET` in the server `.env`.',
  '3. Run **Auth > Login** once, then protected routes work via the cookie jar.'
].join('\n');

/**
 * Folder title overrides keyed by group prefix. Only the empty prefix needs one
 * (it has no slug); every other prefix is derived automatically by stripping the
 * leading `/` and capitalizing (e.g. `/auth` -> `Auth`, `/users` -> `Users`).
 */
export const FOLDER_TITLES: Record<string, string> = {
  '': 'Health'
};

// Only baseUrl lives here (a static default). hmacSecret is intentionally NOT a
// collection variable: the collection is re-pushed on every sync, which would
// wipe a user-entered secret. The secret lives solely in the environment, which
// is created once and never overwritten — set it there.
export const COLLECTION_VARIABLES = [
  { key: 'baseUrl', value: 'http://localhost:3000', type: 'string' }
];
