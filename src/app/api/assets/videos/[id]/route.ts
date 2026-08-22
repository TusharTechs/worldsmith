import { readStoredAsset } from "@/providers/image-storage";
import fs from "fs/promises";
import path from "path";

// Video asset IDs are timestamp+random and the underlying file is written exactly once at
// creation (see storeVideo in image-storage.ts) — the same immutable-caching guarantee images
// already had. Serving these as "no-store" forced a full disk read (previously synchronous,
// blocking the whole event loop) on every single request, including repeat views of the same clip.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  const file = path.join(process.cwd(), ".data", "videos", `${safe}.mp4`);
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(file);
  } catch {
    // Not on local disk: in production the bytes live in Firebase Storage. Asset URIs are
    // persisted in Firestore and must never expire, so the route resolves them rather than the
    // store handing out a signed URL that dies after a week.
    const cloud = await readStoredAsset("videos", safe);
    if (!cloud) return new Response("Not found", { status: 404 });
    return new Response(cloud.bytes as BodyInit, {
      headers: {
        "Content-Type": cloud.contentType,
        "Content-Length": String(cloud.bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const range = req.headers.get("range");
  const cacheControl = "public, max-age=31536000, immutable";

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? Math.min(parseInt(m[1], 10) || 0, stat.size - 1) : 0;
    const end = m?.[2] ? Math.min(parseInt(m[2], 10) || stat.size - 1, stat.size - 1) : stat.size - 1;
    const len = end - start + 1;
    const handle = await fs.open(file, "r");
    const chunk = Buffer.alloc(len);
    try {
      await handle.read(chunk, 0, len, start);
    } finally {
      await handle.close();
    }
    return new Response(chunk, {
      status: 206,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(len),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": cacheControl,
      },
    });
  }

  const bytes = await fs.readFile(file);
  return new Response(bytes, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
    },
  });
}
