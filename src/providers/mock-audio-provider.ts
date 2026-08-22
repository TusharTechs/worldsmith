import { AudioProvider, SpeechRequest, GeneratedAudio } from "./audio-provider";
import { storeAudio } from "./image-storage";
import { pcm16ToWav } from "./gemini-tts-provider";

export class MockAudioProvider implements AudioProvider {
  name = "mock-audio";

  async synthesizeSpeech(_req: SpeechRequest): Promise<GeneratedAudio> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 200));
    const sampleRate = 24000;
    const pcm = Buffer.alloc(sampleRate * 2 * 2); // 2s silence
    const uri = await storeAudio(pcm16ToWav(pcm, sampleRate), "audio/wav", "wav");
    return { provider: "mock-audio", model: "mock", uri, mimeType: "audio/wav", costUSD: 0, latencyMs: Date.now() - t0 };
  }
}