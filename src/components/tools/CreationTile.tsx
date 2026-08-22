'use client';

import { useState } from "react";
import { Download, Film, Music, Type as TypeIcon, ImageOff } from "lucide-react";
import { downloadFromUri, assetFilename } from "@/lib/download";

export type Creation = {
  id: string;
  tool: string;
  kind: string;
  prompt?: string;
  uri?: string | null;
  credits: number;
};

/** Square stand-in used for kinds with no visual, and for a record whose file is gone. */
function Placeholder({ icon, label }: { icon: React.ReactNode; label?: string }) {
  return (
    <div className="flex aspect-square w-full flex-col items-center justify-center gap-1.5 bg-zinc-900 text-zinc-600">
      {icon}
      {label && <span className="text-[9px] uppercase tracking-widest">{label}</span>}
    </div>
  );
}

/**
 * One entry in "Your creations".
 *
 * History records outlive their files: an asset can be deleted, a bucket lifecycle rule can expire
 * it, or a run can be recorded against a file that never finished writing. The record is still
 * worth showing — it is the user's ledger of what they spent — so a missing file degrades to a
 * labelled placeholder rather than a broken-image glyph, and the download button disappears with
 * it instead of sending them to a 404.
 */
export function CreationTile({ r }: { r: Creation }) {
  const [gone, setGone] = useState(false);
  const hasFile = Boolean(r.uri) && !gone;

  return (
    <div className="group relative overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      {r.kind === "image" && (hasFile
        ? <img src={r.uri!} alt="" onError={() => setGone(true)} className="aspect-square w-full object-cover" />
        : <Placeholder icon={<ImageOff size={20} />} label="unavailable" />)}

      {r.kind === "video" && (hasFile
        ? <video src={r.uri!} muted onError={() => setGone(true)} className="aspect-square w-full object-cover" />
        : <Placeholder icon={<ImageOff size={20} />} label="unavailable" />)}

      {r.kind === "audio" && <Placeholder icon={<Music size={20} />} />}
      {r.kind === "text" && <Placeholder icon={<TypeIcon size={20} />} />}
      {!["image", "video", "audio", "text"].includes(r.kind) && <Placeholder icon={<Film size={20} />} />}

      {hasFile && (
        <button
          onClick={() => downloadFromUri(r.uri!, assetFilename(r.tool, r.prompt))}
          title="Download"
          className="absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/80 text-zinc-200 opacity-0 transition-opacity hover:bg-zinc-800 group-hover:opacity-100"
        >
          <Download size={14} />
        </button>
      )}

      <span className="absolute left-1 top-1 rounded bg-zinc-950/80 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-300 border border-zinc-800">
        {r.tool}
      </span>
      <span className="absolute bottom-1 right-1 rounded bg-zinc-950/80 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300 border border-zinc-800">
        −{r.credits}
      </span>
    </div>
  );
}
