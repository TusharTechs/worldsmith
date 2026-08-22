import { VideoGenerationProvider } from "./video-provider";
import { VeoVideoProvider } from "./veo-video-provider";
import { MockVideoProvider } from "./mock-video-provider";

export function videoProviderName(): string {
  return process.env.VIDEO_PROVIDER ?? "vertex";
}

export function createVideoProvider(): VideoGenerationProvider {
  return videoProviderName() === "mock" ? new MockVideoProvider() : new VeoVideoProvider();
}

export function videoProviderMode(): "VEO" | "MOCK" {
  return videoProviderName() === "mock" ? "MOCK" : "VEO";
}