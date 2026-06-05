/**
 * Pure builder: produce a Postman Environment that fills the collection's
 * variables (`baseUrl`, `hmacSecret`) so requests work once it is selected.
 *
 * `baseUrl` is filled from env; `hmacSecret` is left EMPTY and typed `secret` —
 * the real secret is never uploaded to Postman cloud, the user fills it once in
 * the Postman UI. Set POSTMAN_PUSH_HMAC_SECRET=true to pre-fill from HMAC_SECRET.
 */

export function buildEnvironment() {
  const port = process.env.PORT || '3000';
  const baseUrl = process.env.POSTMAN_BASE_URL || `http://localhost:${port}`;

  const prefillSecret = process.env.POSTMAN_PUSH_HMAC_SECRET === 'true';
  const hmacSecret = prefillSecret ? process.env.HMAC_SECRET || '' : '';

  return {
    name: `${process.env.APP_NAME || 'app'}`,
    values: [
      { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
      { key: 'hmacSecret', value: hmacSecret, type: 'secret', enabled: true }
    ]
  };
}
