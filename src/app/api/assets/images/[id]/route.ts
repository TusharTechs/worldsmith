import { readStoredAsset } from "@/providers/image-storage";

/**
 * Serve a stored image by id.
 *
 * Resolves through readStoredAsset so the same URI works whether the bytes live in local `.data`
 * (development) or in Firebase Storage (production). Asset URIs are persisted in Firestore and
 * must therefore never expire — previously production stored a 7-day signed URL directly, so
 * every gallery image went permanently 404 a week after it was made.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const safe = id.replace(/[^a-zA-Z0-9-]/g, "");
  const asset = await readStoredAsset("images", safe);
  if (!asset) return new Response("Not found", { status: 404 });

  // Node's Buffer satisfies BodyInit at runtime; the mismatch is a TS lib-version quirk.
  return new Response(asset.bytes as BodyInit, {
    headers: { "Content-Type": asset.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
