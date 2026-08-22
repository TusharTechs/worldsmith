'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { LANGUAGES, DEFAULT_LOCALE, type LocaleCode } from "@/i18n/languages";
import { en } from "@/i18n/dictionary";
import { DICTIONARIES } from "@/i18n/dictionaries";

interface LanguageContextValue {
  locale: LocaleCode;
  setLocale: (code: LocaleCode) => void;
  /** Looks up a dot-path string leaf (e.g. "home.hero.ctaPrimary"), with {var} interpolation and English fallback. */
  t: (path: string, vars?: Record<string, string | number>) => string;
  /** Looks up a dot-path array/object subtree (e.g. "home.pipeline.steps"), with English fallback. */
  td: <T = unknown>(path: string) => T;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);
const STORAGE_KEY = "ws-locale";

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function interpolate(str: string, vars?: Record<string, string | number>): string {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && LANGUAGES.some((l) => l.code === saved)) {
      setLocaleState(saved as LocaleCode);
    }
  }, []);

  const setLocale = (code: LocaleCode) => {
    setLocaleState(code);
    window.localStorage.setItem(STORAGE_KEY, code);
  };

  const t = useCallback((path: string, vars?: Record<string, string | number>): string => {
    const dict = DICTIONARIES[locale] ?? en;
    let val = getPath(dict, path);
    if (val === undefined) val = getPath(en, path);
    if (typeof val !== "string") return path;
    return interpolate(val, vars);
  }, [locale]);

  const td = useCallback(<T,>(path: string): T => {
    const dict = DICTIONARIES[locale] ?? en;
    let val = getPath(dict, path);
    if (val === undefined) val = getPath(en, path);
    return val as T;
  }, [locale]);

  const value = useMemo(() => ({ locale, setLocale, t, td }), [locale, t, td]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
