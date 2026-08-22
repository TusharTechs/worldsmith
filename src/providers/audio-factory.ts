import { AudioProvider } from "./audio-provider";
import { GeminiTTSProvider } from "./gemini-tts-provider";
import { MockAudioProvider } from "./mock-audio-provider";

export function audioProviderName(): string {
  return process.env.AUDIO_PROVIDER ?? "vertex";
}

export function createAudioProvider(): AudioProvider {
  return audioProviderName() === "mock" ? new MockAudioProvider() : new GeminiTTSProvider();
}

export function audioProviderMode(): "VERTEX" | "MOCK" {
  return audioProviderName() === "mock" ? "MOCK" : "VERTEX";
}