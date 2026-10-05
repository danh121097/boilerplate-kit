import { APP_PREFIX } from "@/enums";
import { getRandomBytes } from "expo-crypto";
import { createMMKV, deleteMMKV, existsMMKV, type MMKV } from "react-native-mmkv";
import * as SecureStore from "expo-secure-store";

/**
 * The app's key-value storage: one AES-256 encrypted MMKV instance holding the
 * auth tokens, persisted stores and the user's preferences. MMKV lives in the app
 * sandbox (iOS Documents, Android files dir), so an uninstall wipes it.
 *
 * The encryption key is a random 32-char hex string generated on first use and
 * kept in `expo-secure-store` (iOS Keychain / Android Keystore) with
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility, so a backup restore never carries the key
 * to another device. It is read once per process with the synchronous
 * SecureStore API, so `getAppStorage()` is synchronous and so is every MMKV call.
 *
 * - A key that cannot be read (locked Keychain) throws; a new key is never
 *   generated over a read error, which would orphan the stored data. The failure
 *   is not cached, so the next call retries.
 * - A missing key with a leftover file (Keychain cleared, Android backup restore)
 *   means the file cannot be decrypted: it is deleted and a new key is generated.
 */
const STORAGE_ID = `${APP_PREFIX}_storage`;
const ENCRYPTION_KEY_SLOT = `${APP_PREFIX}_STORAGE_KEY`;
const ENCRYPTION_KEY_PATTERN = /^[0-9a-f]{32}$/;

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let storage: MMKV | null = null;

function generateEncryptionKey(): string {
  return Array.from(getRandomBytes(16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function openStorage(): MMKV {
  let key = SecureStore.getItem(ENCRYPTION_KEY_SLOT);
  if (!key || !ENCRYPTION_KEY_PATTERN.test(key)) {
    if (existsMMKV(STORAGE_ID)) deleteMMKV(STORAGE_ID);
    key = generateEncryptionKey();
    SecureStore.setItem(ENCRYPTION_KEY_SLOT, key, SECURE_OPTIONS);
  }
  return createMMKV({ id: STORAGE_ID, encryptionKey: key, encryptionType: "AES-256" });
}

/** The encrypted MMKV instance, opened on first use and shared afterwards. */
export function getAppStorage(): MMKV {
  storage ??= openStorage();
  return storage;
}
