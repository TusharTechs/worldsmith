import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { runFfmpeg } from "./ffmpeg";
import { fetchReferenceBytes } from "@/providers/image-storage";
import { Project } from "./project-schemas";
import { Asset } from "./asset-schemas";

const execFileAsync = promisify(execFile);

export interface AssemblyResult {
  bytes: Buffer;
  durationSeconds: number;
  shotBreakdown: Array<{ shotId: string; trimmedTo: number }>;
}

export class Assembler {
  /** Trim each QC-cleared clip to storyboard duration, normalize, concatenate. Keeps Veo's native audio. */
  async assembleFilm(project: Project, videoAssets: Asset[]): Promise<AssemblyResult> {
    const shots = project.storyboard!.shots;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-assembly-"));
    const segments: string[] = [];
    const breakdown: Array<{ shotId: string; trimmedTo: number }> = [];
    

    try {
      for (const shot of shots) {
        const vid = videoAssets.find((v) => v.shotId === shot.shotId && v.status === "COMPLETED");
        if (!vid) throw new Error(`No completed video for shot ${shot.shotId}`);
        if (!vid.uri) throw new Error(`Video for shot ${shot.shotId} has no uri`);

        const src = await this.localize(vid.uri, dir, shot.shotId);
        const target = Math.min(8, Math.max(1, parseFloat(shot.duration) || 8));
        const seg = path.join(dir, `seg-${shot.shotId}.mp4`);

        await runFfmpeg([
          "-i", src,
          "-t", String(target),
          "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24",
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
          "-y", seg,
        ]);
        segments.push(seg);
        breakdown.push({ shotId: shot.shotId, trimmedTo: target });
      }

      const listFile = path.join(dir, "list.txt");
      fs.writeFileSync(listFile, segments.map((s) => `file '${s}'`).join("\n"));
      const out = path.join(dir, "final.mp4");
      await runFfmpeg(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", "-y", out]);

      const bytes = fs.readFileSync(out);
      return {
        bytes,
        durationSeconds: breakdown.reduce((s, b) => s + b.trimmedTo, 0),
        shotBreakdown: breakdown,
      };
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  /**
   * Blend voiceover with the film. The VIDEO is authoritative: never trimmed, never extended.
   * - Film has native audio → amix, audio output duration = film's.
   * - Silent film → VO is conformed to the probed film duration (atrim if longer, apad if shorter).
   */
  async mixVoiceover(filmUri: string, voiceoverUri: string): Promise<Buffer> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-mix-"));
    try {
      const filmPath = await this.localize(filmUri, dir, "film");
      const voPath = await this.localize(voiceoverUri, dir, "vo");
      const out = path.join(dir, "mixed.mp4");

      const target = await this.probeFileSeconds(filmPath);
      const hasAudio = await this.hasAudioStream(filmPath);

      const args = hasAudio
        ? [
            "-i", filmPath, "-i", voPath,
            "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]",
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-y", out,
          ]
        : target
        ? [
            "-i", filmPath, "-i", voPath,
            "-filter_complex", `[1:a]atrim=0:${target.toFixed(3)},apad=whole_dur=${target.toFixed(3)}[aout]`,
            "-map", "0:v", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-y", out,
          ]
        : [
            // No ffprobe available: lay VO as-is; video still never trimmed.
            "-i", filmPath, "-i", voPath,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
            "-y", out,
          ];

      await runFfmpeg(args);
      return fs.readFileSync(out);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  /** Probe actual duration (seconds) of a media URI via ffprobe when available. */
  async probeDurationSeconds(uri: string): Promise<number | null> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-probe-"));
    try {
      const p = await this.localize(uri, dir, "probe");
      return await this.probeFileSeconds(p);
    } catch {
      return null;
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  private async probeFileSeconds(file: string): Promise<number | null> {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file,
      ]);
      const d = parseFloat(stdout.trim());
      return Number.isFinite(d) ? d : null;
    } catch {
      return null;
    }
  }

  /** True if the media file contains at least one audio stream. */
  private async hasAudioStream(file: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("ffprobe", [
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=index",
        "-of", "csv=p=0",
        file,
      ]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

    /** Deterministically sample up to `count` frames (PNG buffers) from any video URI (local, /api, http, or data:). */
  async extractVideoFrames(uri: string, count = 3): Promise<Buffer[]> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-tool-frames-"));
    try {
      const file = await this.localize(uri, dir, "src");
      const outPattern = path.join(dir, "f-%d.png");
      await runFfmpeg([
        "-i", file,
        "-vf", "fps=1/2",
        "-frames:v", String(count),
        "-y", outPattern,
      ]);
      const frames: Buffer[] = [];
      for (let i = 1; i <= count; i++) {
        const p = path.join(dir, `f-${i}.png`);
        if (fs.existsSync(p)) frames.push(fs.readFileSync(p));
      }
      return frames;
    } catch {
      return [];
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  /** Concatenate raw mp4 buffers (same codec) into one file. */
  async concatVideos(buffers: Buffer[]): Promise<Buffer> {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-concat-"));
    try {
      const paths = buffers.map((b, i) => { const p = path.join(dir, `c-${i}.mp4`); fs.writeFileSync(p, b); return p; });
      const list = path.join(dir, "list.txt");
      fs.writeFileSync(list, paths.map((p) => `file '${p}'`).join("\n"));
      const out = path.join(dir, "out.mp4");
      await runFfmpeg(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-y", out]);
      return fs.readFileSync(out);
    } finally {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  }

  /** Resolve a URI to a local file path (videos or audio), downloading remote URLs when needed. */
  private async localize(uri: string, dir: string, shotId: string): Promise<string> {
    if (uri.startsWith("/api/")) {
      const id = uri.split("/").pop()!.replace(/[^a-zA-Z0-9-]/g, "");
      const candidates = [
        path.join(process.cwd(), ".data", "videos", `${id}.mp4`),
        path.join(process.cwd(), ".data", "audio", `${id}.wav`),
        path.join(process.cwd(), ".data", "audio", `${id}.mp3`),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) return p;
      }
    }
    
    const buf = await fetchReferenceBytes(uri.startsWith("/api/") ? `http://localhost:3000${uri}` : uri);
    if (!buf) throw new Error(`Could not fetch media for ${shotId}`);
    const isAudio = uri.includes("/audio/");
    const p = path.join(dir, `src-${shotId}${isAudio ? ".wav" : ".mp4"}`);
    fs.writeFileSync(p, buf);
    return p;
  }
}