import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import ffmpegPath from "ffmpeg-static";

const execFileAsync = promisify(execFile);

/** Bundled ffmpeg with system-PATH fallback. */
export async function runFfmpeg(args: string[]): Promise<void> {
  const candidates = [ffmpegPath as string, "ffmpeg"].filter(Boolean);
  let lastErr: any;
  for (const bin of candidates) {
    try {
      await execFileAsync(bin, args);
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Upscale a still image with ffmpeg's Lanczos scaler. Deterministic and free — no provider
 * split needed (same reasoning as film assembly: it's a local transform, not a generation call).
 */
export async function upscaleImageBytes(
  bytes: Buffer,
  factor: 2 | 4
): Promise<{ bytes: Buffer; width: number; height: number }> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-upscale-"));
  try {
    const inPath = path.join(dir, "in.png");
    const outPath = path.join(dir, "out.png");
    fs.writeFileSync(inPath, bytes);

    await runFfmpeg([
      "-i", inPath,
      "-vf", `scale=iw*${factor}:ih*${factor}:flags=lanczos`,
      "-y", outPath,
    ]);

    const probe = await execFileAsync((ffmpegPath as string) || "ffmpeg", [
      "-i", outPath, "-hide_banner",
    ]).catch((e) => e); // ffmpeg -i with no output writes info to stderr and exits non-zero
    const stderr = String((probe as any)?.stderr ?? "");
    const m = stderr.match(/(\d{2,6})x(\d{2,6})/);

    return {
      bytes: fs.readFileSync(outPath),
      width: m ? parseInt(m[1], 10) : 0,
      height: m ? parseInt(m[2], 10) : 0,
    };
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}