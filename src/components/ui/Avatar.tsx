'use client';

/** Shows the user's uploaded photo when set, falling back to a gradient initial circle otherwise. */
export function Avatar({ photoURL, label, size = 36, className = "" }: { photoURL?: string | null; label: string; size?: number; className?: string }) {
  const initial = label.charAt(0).toUpperCase();
  const style = { width: size, height: size };
  if (photoURL) {
    return <img src={photoURL} alt={label} style={style} className={`rounded-full object-cover shrink-0 ${className}`} />;
  }
  return (
    <div
      style={{ ...style, fontSize: size * 0.42 }}
      className={`rounded-full ws-gradient-bg flex items-center justify-center text-black font-semibold shrink-0 ${className}`}
    >
      {initial}
    </div>
  );
}
