import { DistributionProvider } from "./distribution-provider";
import { GeminiDistributionProvider } from "./gemini-distribution-provider";
import { MockDistributionProvider } from "./mock-distribution-provider";

export function distributionProviderName(): string {
  return process.env.DISTRIBUTION_PROVIDER ?? "vertex";
}

export function createDistributionProvider(): DistributionProvider {
  return distributionProviderName() === "mock" ? new MockDistributionProvider() : new GeminiDistributionProvider();
}

export function distributionProviderMode(): "VERTEX" | "MOCK" {
  return distributionProviderName() === "mock" ? "MOCK" : "VERTEX";
}