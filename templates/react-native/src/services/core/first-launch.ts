import { APP_PREFIX } from "@/enums";
import { clearAuthTokens } from "@/services/core/auth-token-storage";
import * as FileSystem from "expo-file-system";

/**
 * The iOS Keychain survives an app uninstall, so a reinstall would restore the
 * previous install's tokens and boot straight into a stale session. The app's
 * document directory does not survive it: a marker file written there on first
 * launch is absent exactly on the first launch after an install, and only then
 * are the SecureStore tokens cleared (storage outside the Keychain, so no new
 * dependency beyond `expo-file-system`, which Expo already ships).
 *
 * Fail-open: when the marker cannot be read or written, the stored session is
 * kept — wiping it on a storage hiccup would sign users out at random. The
 * marker is written before the clear, so a persistent write failure never turns
 * into a sign-out on every launch.
 *
 * An app updated from a version without this marker looks like a fresh install
 * once and signs out once.
 */
const MARKER_NAME = `${APP_PREFIX}_install_marker`;

let firstLaunchCheck: Promise<void> | null = null;

async function runFirstLaunchCheck(): Promise<void> {
  const dir = FileSystem.documentDirectory;
  if (!dir) return;
  const marker = dir + MARKER_NAME;
  try {
    if ((await FileSystem.getInfoAsync(marker)).exists) return;
    await FileSystem.writeAsStringAsync(marker, "1");
  } catch {
    return;
  }
  try {
    await clearAuthTokens();
  } catch {
    // Stale tokens stay for this launch; the session query decides whether they still work.
  }
}

/**
 * On the first launch after an install, clear the tokens a previous install left
 * in SecureStore. Call before anything reads the stored session. Runs once per
 * process; later calls share the first result.
 */
export function clearStaleTokensOnFirstLaunch(): Promise<void> {
  firstLaunchCheck ??= runFirstLaunchCheck();
  return firstLaunchCheck;
}
