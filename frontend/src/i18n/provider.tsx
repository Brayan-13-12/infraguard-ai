"use client";

import { createContext, useContext, useMemo } from "react";

import { DEFAULT_LANGUAGE, type Language } from "./config";
import en from "./translations/en";
import es, { type TranslationKey, type Translations } from "./translations/es";

const DICTIONARIES: Record<Language, Translations> = { es, en };

type Vars = Record<string, string | number>;

export interface LanguageContextValue {
  /** Always {@link DEFAULT_LANGUAGE} - the UI is Spanish-only. Kept so
   *  date/number formatting can resolve a locale. */
  language: Language;
  /** Resolve a dot-path key, with `{var}` interpolation. */
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

const VALUE: LanguageContextValue = {
  language: DEFAULT_LANGUAGE,
  t: makeTranslator(DEFAULT_LANGUAGE),
};

const LanguageContext = createContext<LanguageContextValue>(VALUE);

/**
 * i18n provider (no dependency, no state). The visible UI is Spanish; this
 * exists so components resolve typed translation keys through one place and
 * `<html lang="es">` (set in the root layout) stays authoritative.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => VALUE, []);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
