"use server";

import { createServerProjectStore } from "@/store/server-factory";
import { ProductionPipeline } from "@/core/orchestrator";
import { verifyUser, ensureUser, getUserCredits } from "@/store/credits-store";
import { estimateProductionCredits } from "@/core/credits";


export async function startProduction(params: {
  idToken: string;
  prompt: string;
  style: string;
  duration: number;
  budgetUSD?: number;
}): Promise<{ projectId: string }> {
  const u = await verifyUser(params.idToken);
  await ensureUser(u.uid, u.email ?? "");

  // The Studio's own check on this is client-side, which makes it a hint, not a control. The
  // research and world-building stages ahead of any image or video call are still real Parallel
  // and Gemini spend, so without this an account at zero could loop them for free.
  const needed = estimateProductionCredits(params.duration);
  const balance = await getUserCredits(u.uid);
  if (balance < needed) {
    throw new Error(`This production needs ≈ ${needed} credits (you have ${balance}). Top up in Pricing.`);
  }

  const store = createServerProjectStore();
  const pipeline = new ProductionPipeline(store);
  const projectId = await pipeline.start(params.prompt, params.style, params.duration, params.budgetUSD, u.uid);
  return { projectId };
}
