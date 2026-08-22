import { ImageGenerationRequest } from "@/providers/image-provider";
import { createImageProvider } from "@/providers/image-factory";
import { ProjectStore } from "@/store/project-store";
import { BudgetGuard } from "./budget";
import { Asset, CostEntry } from "./asset-schemas";
import { DistributionPackage } from "./distribution-schemas";
import { estimateCredits } from "./credits";
import { spendCredits, grantCredits } from "@/store/credits-store";
import { InsufficientCreditsError } from "./asset-director";

type PlatformKey = "youtube" | "instagram" | "pinterest" | "tiktok" | "x" | "linkedin" | "facebook";

export class CreativeDirector {
  private provider = createImageProvider();
  constructor(private store: ProjectStore, private uid?: string) {}

  /** Reserve credits before a paid provider call; throws InsufficientCreditsError if short. */
  private async reserve(credits: number): Promise<void> {
    if (!this.uid) return;
    const r = await spendCredits(this.uid, credits);
    if (!r.ok) throw new InsufficientCreditsError(r.balance, credits);
  }

  /** Return credits reserved for work that produced nothing. Never throws. */
  private async refund(credits: number): Promise<void> {
    if (!this.uid || credits <= 0) return;
    try {
      await grantCredits(this.uid, credits);
    } catch (e) {
      console.error(`[CREATIVE DIRECTOR] refund of ${credits} credits failed for uid=${this.uid}:`, e);
    }
  }

  /**
   * Turn distribution concepts into platform-native creatives, on-model via first-frame reference.
   * Skips platforms that already have a creative unless `force` is true (regenerate all).
   */
  async generateCreatives(projectId: string, budgetUSD?: number, force = false): Promise<DistributionPackage> {
    const project = await this.store.getProject(projectId);
    if (!project?.distributionPackage) throw new Error("Generate the distribution package first");
    const pkg = project.distributionPackage;

    const assets = await this.store.listAssets(projectId);
    const anchor = assets.find((a) => a.type === "IMAGE" && a.shotId && a.status === "COMPLETED");
    const refUri = anchor?.uri ? (anchor.uri.startsWith("/api/") ? `http://localhost:3000${anchor.uri}` : anchor.uri) : undefined;

    const guard = new BudgetGuard(budgetUSD != null ? { budgetUSD } : {});
    guard.recordSpend(project.actualCostUSD ?? 0);
    let spent = project.actualCostUSD ?? 0;
    const ledger: CostEntry[] = [...(project.costLedger ?? [])];

    const jobs: Array<{
      platform: PlatformKey;
      uriField: "thumbnailImageUri" | "coverImageUri" | "pinImageUri" | "postImageUri";
      concept: string;
      width: number;
      height: number;
      role: string;
    }> = [
      { platform: "youtube", uriField: "thumbnailImageUri", concept: pkg.youtube.thumbnailConcept, width: 1280, height: 720, role: "thumbnail" },
      { platform: "instagram", uriField: "coverImageUri", concept: pkg.instagram.coverConcept, width: 896, height: 1120, role: "cover" },
      { platform: "pinterest", uriField: "pinImageUri", concept: pkg.pinterest.pinConcept, width: 832, height: 1248, role: "pin" },
      { platform: "tiktok", uriField: "coverImageUri", concept: pkg.tiktok.coverConcept ?? pkg.tiktok.hook, width: 1080, height: 1920, role: "cover" },
      { platform: "x", uriField: "postImageUri", concept: pkg.x.postConcept ?? pkg.x.shortPost, width: 1600, height: 900, role: "post" },
      { platform: "linkedin", uriField: "postImageUri", concept: pkg.linkedin.postConcept ?? pkg.linkedin.professionalPost, width: 1200, height: 627, role: "post" },
      { platform: "facebook", uriField: "postImageUri", concept: pkg.facebook.postConcept ?? pkg.facebook.caption, width: 1200, height: 630, role: "post" },
    ];

    const updated: DistributionPackage = JSON.parse(JSON.stringify(pkg));

    for (const job of jobs) {
      const existingUri = (updated as any)[job.platform][job.uriField];
      if (existingUri && !force) continue; // already generated — keep unless regenerating

      const req: ImageGenerationRequest = {
        prompt: `Platform creative (${job.role}) for "${project.title}". Concept: ${job.concept}. Style: ${project.worldBible?.visualStyle.artDirection ?? "cinematic"}. Bold, high-contrast, scroll-stopping composition, no text overlays.`,
        width: job.width,
        height: job.height,
        importance: "HERO",
        references: refUri ? [refUri] : [],
      };
      const est = this.provider.estimateCost(req);
      guard.assertWithin(est);

      // Reserved before the provider call: charging afterwards let an account with no credits
      // still collect one finished creative per run, since the image existed by the time the
      // debit failed. Out of credits now means the batch stops here with nothing spent.
      const unitCredits = estimateCredits("image");
      try {
        await this.reserve(unitCredits);
      } catch (e) {
        if (e instanceof InsufficientCreditsError) break; // keep what's already done
        throw e;
      }

      let img;
      try {
        img = await this.provider.generate(req);
      } catch (e) {
        await this.refund(unitCredits); // nothing was produced — don't bill for it
        throw e;
      }
      guard.recordSpend(img.costUSD);
      spent += img.costUSD;
      ledger.push({
        at: Date.now(),
        kind: "image",
        provider: img.provider,
        model: img.model,
        costUSD: img.costUSD,
        note: `creative ${job.platform}/${job.role}${force && existingUri ? " (regen)" : ""}`,
      });

      const asset: Asset = {
        id: `creative-${job.platform}-${Date.now()}`,
        projectId,
        type: "IMAGE",
        provider: img.provider,
        model: img.model,
        prompt: req.prompt,
        uri: img.uri,
        status: "COMPLETED",
        retryCount: 0,
        costUSD: img.costUSD,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await this.store.saveAsset(asset);
      (updated as any)[job.platform][job.uriField] = img.uri;
      await this.store.updateProject(projectId, {
        actualCostUSD: spent,
        costLedger: ledger,
        distributionPackage: updated,
      });

    }

    return updated;
  }
}