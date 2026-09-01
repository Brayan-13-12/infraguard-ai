/**
 * Internationalisation configuration.
 *
 * Two languages, Spanish first. The choice is a non-sensitive UI preference and
 * is the only thing persisted to `localStorage` here - never auth data.
 */

export const LANGUAGES = ["es", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

/** Spanish is the product default. */
export const DEFAULT_LANGUAGE: Language = "es";

/** `localStorage` key for the persisted language choice. */
export const LANGUAGE_STORAGE_KEY = "infraguard.language";

/** Compact label for the switcher control. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "ES",
  en: "EN",
};

/** Full endonym - used for accessible names. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  es: "Español",
  en: "English",
};

/** Maps a language to the BCP-47 locale used for date/number formatting. */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  es: "es-ES",
  en: "en-US",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}
