/** Languages offered in the site's language switcher — native names, no flags. */
export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "it", label: "Italiano" },
  { code: "hi", label: "हिन्दी" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية" },
  { code: "id", label: "Bahasa Indonesia" },
] as const;

export type LocaleCode = (typeof LANGUAGES)[number]["code"];
export const DEFAULT_LOCALE: LocaleCode = "en";
