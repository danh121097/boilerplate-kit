import { resetStorage } from "@/__tests__/helpers/fake-storage";
import { STORAGE_KEYS } from "@/enums";
import { getAppStorage } from "@/services/core/app-storage";
import i18next from "i18next";

let mockDevice: string | undefined;
jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: mockDevice }],
}));

import { detectLanguage, initI18n, restoreSavedLanguage, setLocale } from "@/i18n/i18n";

describe("locale resolution (saved > device > env > en)", () => {
  let envSnapshot: string | undefined;
  beforeEach(() => {
    resetStorage();
    mockDevice = undefined;
    envSnapshot = process.env.EXPO_PUBLIC_LANGUAGE_CODE;
    delete process.env.EXPO_PUBLIC_LANGUAGE_CODE;
  });
  afterEach(() => {
    if (envSnapshot === undefined) delete process.env.EXPO_PUBLIC_LANGUAGE_CODE;
    else process.env.EXPO_PUBLIC_LANGUAGE_CODE = envSnapshot;
  });

  it("uses the device language, then the env code, then en", () => {
    mockDevice = "ja";
    process.env.EXPO_PUBLIC_LANGUAGE_CODE = "en";
    expect(detectLanguage()).toBe("ja");

    mockDevice = "fr";
    process.env.EXPO_PUBLIC_LANGUAGE_CODE = "ja";
    expect(detectLanguage()).toBe("ja");

    delete process.env.EXPO_PUBLIC_LANGUAGE_CODE;
    expect(detectLanguage()).toBe("en");
  });

  it("persists the choice and lets it beat the device language on the next launch", async () => {
    mockDevice = "en";
    initI18n();
    await i18next.changeLanguage("en");

    await setLocale("ja");
    expect(getAppStorage().getString(STORAGE_KEYS.LANGUAGE)).toBe("ja");

    await i18next.changeLanguage("en"); // a fresh launch starts from the device language
    await restoreSavedLanguage();
    expect(i18next.language).toBe("ja");
  });

  it("ignores an unsupported saved value", async () => {
    initI18n();
    await i18next.changeLanguage("en");
    getAppStorage().set(STORAGE_KEYS.LANGUAGE, "fr");
    await restoreSavedLanguage();
    expect(i18next.language).toBe("en");
  });
});
