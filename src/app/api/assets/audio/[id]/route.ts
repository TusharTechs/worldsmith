import { readStoredAsset } from "@/providers/image-storage";
import fs from "fs/promises";
import path from "path";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  for (const ext of ["wav", "mp3"]) {
    const file = path.join(process.cwd(), ".data", "audio", `${safe}.${ext}`);
    try {
      const bytes = await fs.readFile(file);
      return new Response(bytes, {
        headers: {
          "Content-Type": ext === "wav" ? "audio/wav" : "audio/mpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // try the next extension
    }
  }
  // Not on local disk: resolve against Firebase Storage. Asset URIs are persisted in Firestore
  // and must never expire, so the route resolves them rather than the store handing out a signed
  // URL that dies after a week.
  const cloud = await readStoredAsset("audio", safe);
  if (!cloud) return new Response("Not found", { status: 404 });
  return new Response(cloud.bytes as BodyInit, {
    headers: { "Content-Type": cloud.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
