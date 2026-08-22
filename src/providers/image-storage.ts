import { getApps } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import fs from "fs";
import path from "path";
import { isAdminConfigured } from "@/store/admin-firestore-store";

let storageBroken = false;

function bucketFor(adminApp: ReturnType<typeof getApps>[number]) {
  const name = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  return name ? getStorage(adminApp).bucket(name) : getStorage(adminApp).bucket();
}

function handleUploadError(e: unknown, kind: string) {
  const msg = String((e as any)?.message ?? e);
  if (/bucket does not exist|Bucket name not specified/i.test(msg)) {
    if (!storageBroken) {
      storageBroken = true;
      console.warn(
        `[IMAGE-STORAGE] Firebase Storage bucket unavailable — using local .data storage for this process. (Enable via Firebase Console → Build → Storage for cloud URLs.)`
      );
    }
  } else {
    console.error(`[IMAGE-STORAGE] ${kind} upload failed, using local file`, e);
  }
}

export async function fetchReferenceBytes(ref: string): Promise<Buffer | null> {
  try {
    if (ref.startsWith("data:")) return Buffer.from(ref.split(",")[1], "base64");
    if (ref.startsWith("http")) {
      const res = await fetch(ref);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Last-resort local write, used when Storage is unavailable.
 *
 * On a serverless host the working directory is read-only, so this throws EROFS — a cryptic
 * failure for what is really a missing piece of project setup. Storage being unreachable is the
 * actual problem; say so, because silently succeeding is not an option here and the raw errno
 * sends people looking in the wrong place.
 */
function writeLocalAsset(kind: "images" | "videos" | "audio", id: string, ext: string, bytes: Buffer): string {
  const dir = path.join(process.cwd(), ".data", kind);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.${ext}`), bytes);
  } catch (e) {
    const errno = (e as NodeJS.ErrnoException).code;
    if (errno === "EROFS" || errno === "EACCES" || errno === "EPERM") {
      throw new Error(
        "Cannot store generated media. Firebase Storage is not reachable, and this host has a " +
        "read-only filesystem to fall back to. Enable Storage for the project and set " +
        `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET to a bucket that exists. (${errno})`
      );
    }
    throw e;
  }
  return `/api/assets/${kind}/${id}`;
}

export async function storeImage(bytes: Buffer, mimeType: string): Promise<string> {
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (isAdminConfigured() && !storageBroken) {
    try {
      const adminApp = getApps().find((a) => a.name === "worldsmith-admin");
      if (adminApp) {
        const file = bucketFor(adminApp).file(`worldsmith/${id}.png`);
        await file.save(bytes, { contentType: mimeType });
        // Deliberately NOT a signed URL. Signed URLs expire (this code used a 7-day window) and
        // the returned string is persisted into Firestore against the run and the project — so
        // every gallery image and every project asset would 404 permanently a week after it was
        // made. The stable route reference never expires; the route resolves it against Storage.
        return `/api/assets/images/${id}`;
      }
    } catch (e) {
      handleUploadError(e, "image");
    }
  }
  return writeLocalAsset("images", id, "png", bytes);
}

export async function storeVideo(bytes: Buffer): Promise<string> {
  const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (isAdminConfigured() && !storageBroken) {
    try {
      const adminApp = getApps().find((a) => a.name === "worldsmith-admin");
      if (adminApp) {
        const file = bucketFor(adminApp).file(`worldsmith/videos/${id}.mp4`);
        await file.save(bytes, { contentType: "video/mp4" });
        return `/api/assets/videos/${id}`;   // stable, not an expiring signed URL — see storeImage
      }
    } catch (e) {
      handleUploadError(e, "video");
    }
  }
  return writeLocalAsset("videos", id, "mp4", bytes);
}

/**
 * Best-effort cleanup for one stored asset (local file or cloud object) by its URI.
 * Non-fatal: failures are logged, never thrown, so cleanup can't block a project delete.
 */
export async function deleteStoredAsset(uri: string | undefined): Promise<void> {
  if (!uri) return;
  try {
    const local = uri.match(/^\/api\/assets\/(images|videos|audio)\/([^/?]+)/);
    if (local) {
      const [, kind, id] = local;
      const dir = path.join(process.cwd(), ".data", kind);
      const exts = kind === "images" ? ["png"] : kind === "videos" ? ["mp4"] : ["wav", "mp3", "ogg"];
      for (const ext of exts) {
        const file = path.join(dir, `${id}.${ext}`);
        if (fs.existsSync(file)) { fs.unlinkSync(file); break; }
      }
      return;
    }
    if (isAdminConfigured() && /storage\.googleapis\.com|firebasestorage/.test(uri)) {
      const adminApp = getApps().find((a) => a.name === "worldsmith-admin");
      if (adminApp) {
        const url = new URL(uri);
        const objectPath = decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ""));
        await bucketFor(adminApp).file(objectPath).delete({ ignoreNotFound: true } as any);
      }
    }
  } catch (e) {
    console.warn("[IMAGE-STORAGE] deleteStoredAsset failed (non-fatal):", uri, e);
  }
}

export async function storeAudio(bytes: Buffer, mimeType: string, ext: string): Promise<string> {
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (isAdminConfigured() && !storageBroken) {
    try {
      const adminApp = getApps().find((a) => a.name === "worldsmith-admin");
      if (adminApp) {
        const file = bucketFor(adminApp).file(`worldsmith/audio/${id}.${ext}`);
        await file.save(bytes, { contentType: mimeType });
        return `/api/assets/audio/${id}`;    // stable, not an expiring signed URL — see storeImage
      }
    } catch (e) {
      handleUploadError(e, "audio");
    }
  }
  return writeLocalAsset("audio", id, ext, bytes);
}


/**
 * Ids already proven absent, so a repeat request answers instantly.
 *
 * A miss costs a Storage round-trip (~500ms observed). The gallery renders many tiles at once and
 * an orphaned record — an asset deleted, or a run whose file was cleaned up — is re-requested on
 * every render, so without this a handful of dead ids stall the whole grid.
 *
 * Caching a miss is safe because ids are minted at write time (`storeImage`/`storeVideo`/
 * `storeAudio` are the only writers here, each generating a fresh unique id), so no caller can
 * hold an id before its file exists. The TTL is a backstop, not a correctness requirement.
 */
const missCache = new Map<string, number>();
const MISS_TTL_MS = 60_000;

/**
 * Read a stored asset by id, wherever it lives.
 *
 * Asset URIs are stable route references, so the route has to resolve them: local `.data` in
 * development, the Storage object in production. Returns null when neither has it.
 */
export async function readStoredAsset(
  kind: "images" | "videos" | "audio",
  id: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const cacheKey = `${kind}/${id}`;
  const missedAt = missCache.get(cacheKey);
  if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;

  const exts = kind === "images" ? ["png"] : kind === "videos" ? ["mp4"] : ["wav", "mp3", "ogg"];
  const typeFor = (ext: string) =>
    ext === "png" ? "image/png" : ext === "mp4" ? "video/mp4"
    : ext === "mp3" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : "audio/wav";

  for (const ext of exts) {
    const file = path.join(process.cwd(), ".data", kind, `${id}.${ext}`);
    try {
      return { bytes: fs.readFileSync(file), contentType: typeFor(ext) };
    } catch { /* try the next extension, then cloud */ }
  }

  if (isAdminConfigured() && !storageBroken) {
    const adminApp = getApps().find((a) => a.name === "worldsmith-admin");
    if (adminApp) {
      const prefix = kind === "images" ? "worldsmith" : `worldsmith/${kind}`;
      for (const ext of exts) {
        try {
          const [buf] = await bucketFor(adminApp).file(`${prefix}/${id}.${ext}`).download();
          return { bytes: buf, contentType: typeFor(ext) };
        } catch { /* not this extension */ }
      }
    }
  }
  missCache.set(cacheKey, Date.now());
  return null;
}
