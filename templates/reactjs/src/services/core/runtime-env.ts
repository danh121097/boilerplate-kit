/** Build-time flags read from the bundler env, kept out of the shared transport code. */

/** True in a development build. */
export function isDevBuild(): boolean {
  return import.meta.env.DEV;
}
