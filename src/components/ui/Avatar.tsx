'use client';

import { useEffect, useState } from "react";

/**
 * Shows the user's photo when set, falling back to a gradient initial circle otherwise.
 *
 * The fallback also covers a photo that fails to load. Google's avatar URLs are not guaranteed to
 * be fetchable from every origin — they can be rate-limited or blocked by referrer policy — and a
 * bare <img> renders that as a broken-image glyph beside the user's own name, which looks like the
 * account is broken. Degrading to the initial circle is always better than showing that.
 */
export function Avatar({ photoURL, label, size = 36, className = "" }: { photoURL?: string | null; label: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  // A new photo deserves a fresh attempt; without this, one failure sticks across account changes.
  useEffect(() => { setFailed(false); }, [photoURL]);

  const initial = label.charAt(0).toUpperCase();
  const style = { width: size, height: size };

  if (photoURL && !failed) {
    return (
      <img
        src={photoURL}
        alt={label}
        style={style}
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ ...style, fontSize: size * 0.42 }}
      className={`rounded-full ws-gradient-bg flex items-center justify-center text-black font-semibold shrink-0 ${className}`}
      aria-label={label}
    >
      {initial}
    </div>
  );
}
