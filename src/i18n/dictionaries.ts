import { en, type PartialDictionary } from "./dictionary";
import type { LocaleCode } from "./languages";
import { es } from "./dictionaries/es";
import { fr } from "./dictionaries/fr";
import { de } from "./dictionaries/de";
import { pt } from "./dictionaries/pt";
import { hi } from "./dictionaries/hi";
import { ja } from "./dictionaries/ja";
import { zh } from "./dictionaries/zh";
import { ar } from "./dictionaries/ar";

// Locales hold a *deep* partial (see PartialDictionary): any key a translation hasn't covered
// falls back to English at lookup time, so adding new English copy never breaks a locale build.
//
// it (Italian), ko (Korean), id (Indonesian) are selectable in the language switcher but have
// no dictionary yet — they fall back to English entirely until translated in a later pass.
export const DICTIONARIES: Partial<Record<LocaleCode, PartialDictionary>> = {
  en, es, fr, de, pt, hi, ja, zh, ar,
};
