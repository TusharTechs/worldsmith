'use client';

import { useEffect, useState } from "react";

/**
 * Rotating type/hold/delete placeholder.
 *
 * Shared by the Toolbox prompt fields and the Studio composer so the product has one typing
 * rhythm rather than two that drift apart. Runs only while `active` (i.e. the field is empty),
 * so it never animates underneath something the user is writing.
 */
export function useTypewriterPlaceholder(strings: string[], active: boolean): string {
  const [text, setText] = useState("");
  const key = strings.join("\n");
  useEffect(() => {
    if (!active || strings.length === 0) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setText(strings[0]);
      return;
    }
    let strIndex = 0;
    let charIndex = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const TYPE_MS = 38, DELETE_MS = 20, HOLD_MS = 1600, GAP_MS = 400;
    const tick = () => {
      const current = strings[strIndex % strings.length];
      if (!deleting) {
        charIndex += 1;
        setText(current.slice(0, charIndex));
        if (charIndex >= current.length) { deleting = true; timer = setTimeout(tick, HOLD_MS); }
        else timer = setTimeout(tick, TYPE_MS);
      } else {
        charIndex -= 1;
        setText(current.slice(0, charIndex));
        if (charIndex <= 0) { deleting = false; strIndex += 1; timer = setTimeout(tick, GAP_MS); }
        else timer = setTimeout(tick, DELETE_MS);
      }
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, active]);
  return text;
}
