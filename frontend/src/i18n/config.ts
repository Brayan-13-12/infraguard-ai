/**
 * Internationalisation configuration.
 *
 * The visible UI is Spanish-only. The i18n layer is kept (typed keys, `es.ts` as
 * the source of truth, `en.ts` validated structurally against it) so wording
 * lives in one place and a second locale can be reintroduced later - but there
 * is no language switcher, and no language preference is ever persisted.
 */

export const LANGUAGES = ["es", "en"] as const;

export type Language = (typeof LANGUAGES)[number];

/** The product renders in Spanish. */
export const DEFAULT_LANGUAGE: Language = "es";

/**
 * Maps a language to the BCP-47 locale used for date/number formatting. Kept
 * even though the UI is Spanish-only: dates/numbers still format through it.
 */
export const LANGUAGE_LOCALES: Record<Language, string> = {
  es: "es-ES",
  en: "en-US",
};
