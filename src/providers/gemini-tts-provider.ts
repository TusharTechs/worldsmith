import fs from "fs";
import os from "os";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { AudioProvider, SpeechRequest, GeneratedAudio } from "./audio-provider";
import { storeAudio } from "./image-storage";
import { resolveVertexConfig } from "./vertex-provider";
import { withRetry } from "./retry";
import { runFfmpeg } from "@/core/ffmpeg";

/** Wrap raw 16-bit PCM in a RIFF/WAV header — deterministic, no deps. */
export function pcm16ToWav(pcm: Buffer, sampleRate = 24000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function wavSeconds(wav: Buffer, sampleRate = 24000): number {
  return Math.max(0, (wav.length - 44) / (sampleRate * 2));
}

/**
 * Deterministically fit a WAV to the target duration via atempo.
 * Two-way: speeds up (≤1.3x) or slows down (≥0.75x) — quality-safe both ways.
 */
async function fitWavToSeconds(wav: Buffer, targetSeconds: number): Promise<Buffer> {
  const dur = wavSeconds(wav);
  if (Math.abs(dur - targetSeconds) <= 0.1) return wav;
  const ratio = Math.min(1.3, Math.max(0.75, dur / targetSeconds));
  if (ratio === 1) return wav;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-tts-fit-"));
  const inP = path.join(dir, "in.wav");
  const outP = path.join(dir, "out.wav");
  try {
    fs.writeFileSync(inP, wav);
    await runFfmpeg(["-i", inP, "-filter:a", `atempo=${ratio.toFixed(3)}`, "-y", outP]);
    return fs.readFileSync(outP);
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

export class GeminiTTSProvider implements AudioProvider {
  name = "vertex-tts";
  private client: GoogleGenAI;
  private model: string;
  private perCallCost: number;

  constructor() {
    const cfg = resolveVertexConfig();
    process.env.GOOGLE_APPLICATION_CREDENTIALS = cfg.serviceAccountPath;
    this.client = new GoogleGenAI({ vertexai: true, project: cfg.projectId, location: cfg.location });
    this.model = process.env.TTS_MODEL ?? "gemini-2.5-flash-preview-tts";
    this.perCallCost = parseFloat(process.env.TTS_COST_USD ?? "0.001");
  }

  async synthesizeSpeech(req: SpeechRequest): Promise<GeneratedAudio> {
    const t0 = Date.now();
    const styled = req.styleHint ? `${req.styleHint}: ${req.text}` : req.text;

    const response = await withRetry(
      () =>
        this.client.models.generateContent({
          model: this.model,
          contents: [{ role: "user", parts: [{ text: styled }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voiceName ?? "Kore" } } },
          } as any,
        }),
      { label: "TTS", retries: 2, baseDelayMs: 5000 }
    );

    const part: any = response.candidates?.[0]?.content?.parts?.[0];
    const b64 = part?.inlineData?.data;
    if (!b64) throw new Error("[TTS] no audio in response");

    const pcm = Buffer.from(b64, "base64");
    let wav = pcm16ToWav(pcm, 24000);

    // Guarantee: land exactly on the film's duration (compress or stretch, quality-safe range)
    if (req.maxSeconds) {
      wav = await fitWavToSeconds(wav, req.maxSeconds);
    }

    const uri = await storeAudio(wav, "audio/wav", "wav");
    return {
      provider: "vertex-tts",
      model: this.model,
      uri,
      mimeType: "audio/wav",
      durationSeconds: wavSeconds(wav),
      costUSD: this.perCallCost,
      latencyMs: Date.now() - t0,
    };
  }
}