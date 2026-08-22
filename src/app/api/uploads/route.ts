import { NextRequest, NextResponse } from "next/server";
import { verifyUser } from "@/store/credits-store";
import { storeImage } from "@/providers/image-storage";

export const runtime = "nodejs";

/**
 * Image intake for the Toolbox.
 *
 * Uploads used to travel to the server as base64 data URLs passed straight into server actions.
 * Next.js serializes action arguments through Flight, which caps how large a single argument can
 * be — a 1.3 MB PNG becomes a ~1.8 MB string and the call died with "Maximum array nesting
 * exceeded". That broke every tool that takes a picture: upscale, image→prompt, image→video,
 * scene, and all reference images, for any photo of a realistic size.
 *
 * A route handler has no such limit, so the bytes come here as a normal request body and the
 * caller then passes back only the short stored URI.
 */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  try {
    await verifyUser(token);
  } catch {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Expected a 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: `Image is too large (max ${MAX_BYTES / 1024 / 1024} MB)` }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are accepted" }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const uri = await storeImage(bytes, file.type || "image/png");
  return NextResponse.json({ uri });
}
