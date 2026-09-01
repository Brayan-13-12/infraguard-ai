"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
  isLanguage,
  type Language,
} from "./config";
import en from "./translations/en";
import es, { type TranslationKey, type Translations } from "./translations/es";

const DICTIONARIES: Record<Language, Translations> = { es, en };

type Vars = Record<string, string | number>;

export interface LanguageContextValue {
  language: Language;
  languages: readonly Language[];
  setLanguage: (language: Language) => void;
  /** Resolve a dot-path key for the active language, with `{var}` interpolation. */
  t: (key: TranslationKey, vars?: Vars) => string;
}

function resolve(tree: Translations, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object"
          ? (node as Record<string, unknown>)[part]
          : undefined,
      tree,
    );
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

function makeTranslator(language: Language) {
  return (key: TranslationKey, vars?: Vars): string => {
    const raw =
      resolve(DICTIONARIES[language], key) ?? resolve(DICTIONARIES.es, key) ?? key;
    return interpolate(raw, vars);
  };
}

/** Default value - a working Spanish translator so components render without a provider. */
const FALLBACK: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  languages: LANGUAGES,
  setLanguage: () => {},
  t: makeTranslator(DEFAULT_LANGUAGE),
};

const LanguageContext = createContext<LanguageContextValue>(FALLBACK);

/**
 * Lightweight i18n provider (no dependency). Server and first client render use
 * {@link DEFAULT_LANGUAGE}; a persisted choice is applied in an effect after
 * mount, so there is no hydration mismatch. The choice is a non-sensitive UI
 * preference stored in `localStorage`.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(stored)) setLanguageState(stored);
    } catch {
      /* storage may be unavailable - keep the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* ignore - the in-memory choice still applies for this session */
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      languages: LANGUAGES,
      setLanguage,
      t: makeTranslator(language),
    }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
