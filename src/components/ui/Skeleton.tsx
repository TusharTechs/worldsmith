export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`ws-skeleton rounded ${className}`} />;
}

/** Drop-in replacement for a bare "Generating..." line — shows the shape of what's coming. */
export function SkeletonCard({ lines = 3, image = false }: { lines?: number; image?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
      {image && <Skeleton className="w-full aspect-video" />}
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 3, image = true }: { count?: number; image?: boolean }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} image={image} />
      ))}
    </div>
  );
}
