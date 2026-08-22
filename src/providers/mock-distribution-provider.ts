import { DistributionProvider } from "./distribution-provider";
import { DistributionPackage } from "@/core/distribution-schemas";
import { Project } from "@/core/project-schemas";

export class MockDistributionProvider implements DistributionProvider {
  name = "mock";

  async generateDistributionPackage(project: Project): Promise<DistributionPackage> {
    await new Promise((r) => setTimeout(r, 400));
    const title = project.title ?? "Untitled Production";
    const premise = project.worldBible?.premise ?? "An original story";
    const chars = project.worldBible?.characters.map((c) => c.name).join(", ") ?? "our hero";
    return {
      projectId: project.id,
      generatedAt: Date.now(),
      youtube: {
        titles: [`${title} — Official Short`, `${title} | A ${premise.slice(0, 40)}...`, `${title} (Animated Short Film)`],
        description: `${premise}\n\nCreated with Worldsmith — an autonomous AI media studio.\n\nCharacters: ${chars}\n\nSubscribe for more original animated shorts.`,
        tags: ["animated short", "cinematic", "ai film", "indie animation", title.toLowerCase().replace(/\s+/g, "")],
        thumbnailConcept: `Dramatic close-up of ${chars.split(",")[0]} against a moody backdrop with bold title text`,
        shortsTitle: `${title} in 60 seconds`,
        shortsDescription: `A quick look at ${title}. ${premise.slice(0, 100)}...`,
      },
      instagram: {
        reelCaption: `${premise}\n\n#${title.replace(/\s+/g, "").toLowerCase()} #animation #shortfilm #cinematic`,
        hook: `What happens when ${chars.split(",")[0]} takes their first step...`,
        hashtags: ["animation", "shortfilm", "cinematic", "indiefilm", "aiart", "filmmaking", "storytelling"],
        coverConcept: `Vertical frame of ${chars.split(",")[0]} in a key moment, high contrast`,
      },
      tiktok: {
        caption: `${premise.slice(0, 120)}...`,
        hook: `POV: ${premise.slice(0, 60)}`,
        hashtags: ["fyp", "animation", "shortfilm", "storytime", "aiart"],
        coverConcept: `Bold vertical cover frame of ${chars.split(",")[0]} mid-action, punchy text-safe composition`,
      },
      pinterest: {
        pinTitle: `${title} — Cinematic Animated Short`,
        pinDescription: `${premise}. A short film generated end-to-end by Worldsmith.`,
        pinConcept: `Vertical cinematic poster with moody lighting and the title`,
      },
      x: {
        shortPost: `Just shipped ${title}. ${premise.slice(0, 120)}...`,
        thread: [
          `🧵 Introducing ${title}`,
          `Built entirely by Worldsmith — from research to final cut.`,
          `Characters: ${chars}`,
          `Concept: ${premise}`,
          `Watch the full film 👇`,
        ],
        launchPost: `Today we're releasing ${title} — a short film created autonomously, end-to-end.`,
        postConcept: `Widescreen key art of ${chars.split(",")[0]}, bold and shareable, no text`,
      },
      linkedin: {
        professionalPost: `I'm excited to share ${title}, a short film produced end-to-end by an autonomous AI studio I'm building called Worldsmith.\n\nFrom a single idea to a finished film, with research, world-building, storyboarding, generation, continuity QC, and assembly — all autonomous.\n\nWould love feedback from creators and filmmakers.`,
        creatorAngle: `What does it mean for a studio to be autonomous? ${title} is our proof of concept.`,
        postConcept: `Clean, professional widescreen still of ${chars.split(",")[0]}, understated and polished`,
      },
      facebook: {
        caption: `${premise}\n\nA new animated short from Worldsmith.`,
        postConcept: `Warm, inviting widescreen frame of ${chars.split(",")[0]} for a community feed`,
      },
      generic: {
        teaserCopy: `Coming soon: ${title}`,
        trailerCopy: `${premise}. A cinematic animated short.`,
        narrationScript: `In a world of scrap, one small key turns toward the light.`,
        quoteCardIdeas: [
          `"${premise.slice(0, 60)}..." — ${title}`,
          `"Every frame, directed by an autonomous studio."`,
          `"${chars.split(",")[0]} — a story worth telling."`,
        ],
        communityPost: `We just released ${title}. We'd love to hear what you think and what you'd want to see next.`,
        alternateHooks: [
          `What if ${premise.slice(0, 50)}...`,
          `Meet ${chars.split(",")[0]}.`,
          `A story about ${premise.slice(0, 40)}...`,
        ],
      },
    };
  }
}