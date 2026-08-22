'use client';

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm",
};

/** Forces a browser download of a remote/local file (image, video, audio) under a chosen base
 * name — the actual extension is derived from the fetched content's real MIME type, not guessed
 * from the tool, since providers don't always agree on format. Fetches to a blob first so the
 * `download` attribute's filename is honored even for cross-origin URLs (e.g. Firebase signed
 * storage URLs) that would otherwise just navigate away instead of downloading. */
export async function downloadFromUri(uri: string, baseName: string): Promise<void> {
  try {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const blob = await res.blob();
    const ext = EXT_BY_MIME[blob.type] ?? (blob.type.split("/")[1] || "bin");
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `${baseName}.${ext}`);
    URL.revokeObjectURL(url);
  } catch {
    // CORS or network failure — open in a new tab so the user can still save it via the browser's
    // own "Save as", even without a forced filename. `_blank` plus noopener matters: a plain
    // navigation replaced the page the user was working on, which for a missing asset meant
    // losing their session state to a 404.
    const w = window.open(uri, "_blank", "noopener");
    if (!w) console.warn("[download] popup blocked; asset unavailable:", uri);
  }
}

/** Downloads a plain string (a prompt, description, tag list, etc.) as a text file. */
export function downloadText(text: string, filename: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  URL.revokeObjectURL(url);
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Words that carry no meaning in a filename. Dropping them is what turns
 * "a-neon-lit-ramen-shop-in-the" into "neon-lit-ramen-shop".
 */
const FILLER = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "and", "or", "but", "from",
  "by", "as", "is", "are", "was", "were", "this", "that", "these", "those", "it", "its",
  "into", "onto", "over", "under", "up", "down", "out", "off", "then", "than", "very",
]);

/**
 * Build a descriptive download filename from whatever produced the asset.
 *
 * Downloads used to be named after an internal id — `worldsmith-t2i-NW09oVQ0hukYY7jwpF7E` — or a
 * bare timestamp, so a folder of them was unreadable and nothing said what any file contained.
 * The label is whatever text the asset came from (a prompt, a character name, a narration script);
 * this reduces it to the first few meaningful words.
 *
 * Non-Latin prompts keep their own characters rather than being stripped to nothing — a Hindi or
 * Japanese prompt still yields a readable name.
 */
export function assetFilename(tool: string, label?: string): string {
  // Prompts commonly lead with the format and put the subject after a colon
  // ("Vertical TikTok clip: a street-food wok bursting into flame"). The subject is the useful
  // half, so prefer it whenever there is enough of it to name a file by.
  const raw = label ?? "";
  const afterColon = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : "";
  const source = afterColon.trim().split(/\s+/).filter(Boolean).length >= 3 ? afterColon : raw;

  const words = source
    .toLowerCase()
    // \p{M} matters: Devanagari, Thai and Arabic vowel marks are Marks, not Letters, so
    // without it a word like "नीयन" splits at every matra into meaningless fragments.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));

  const slug = words.slice(0, 4).join("-").slice(0, 60).replace(/-+$/, "");
  // No usable words (an empty prompt, or a label that was all punctuation) — fall back to
  // something unique rather than colliding every download on the same name.
  return slug ? `worldsmith-${slug}` : `worldsmith-${tool}-${Date.now()}`;
}
