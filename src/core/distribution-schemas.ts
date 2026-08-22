import { z } from "zod";

export const YouTubeSchema = z.object({
  titles: z.array(z.string()).min(3).max(5),
  description: z.string(),
  tags: z.array(z.string()),
  thumbnailConcept: z.string(),
  shortsTitle: z.string(),
  shortsDescription: z.string(),
  thumbnailImageUri: z.string().optional(),
});

export const InstagramSchema = z.object({
  reelCaption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
  coverConcept: z.string(),
  coverImageUri: z.string().optional(),
});

export const TikTokSchema = z.object({
  caption: z.string(),
  hook: z.string(),
  hashtags: z.array(z.string()),
  coverConcept: z.string().optional(),
  coverImageUri: z.string().optional(),
});

export const PinterestSchema = z.object({
  pinTitle: z.string(),
  pinDescription: z.string(),
  pinConcept: z.string(),
  pinImageUri: z.string().optional(),
});

export const XSchema = z.object({
  shortPost: z.string(),
  thread: z.array(z.string()),
  launchPost: z.string(),
  postConcept: z.string().optional(),
  postImageUri: z.string().optional(),
});

export const LinkedInSchema = z.object({
  professionalPost: z.string(),
  creatorAngle: z.string(),
  postConcept: z.string().optional(),
  postImageUri: z.string().optional(),
});

export const FacebookSchema = z.object({
  caption: z.string(),
  postConcept: z.string().optional(),
  postImageUri: z.string().optional(),
});

export const GenericSchema = z.object({
  teaserCopy: z.string(),
  trailerCopy: z.string(),
  narrationScript: z.string().optional(),
  narrationStyle: z.string().optional(),
  quoteCardIdeas: z.array(z.string()),
  communityPost: z.string(),
  alternateHooks: z.array(z.string()),
});

export const DistributionPackageSchema = z.object({
  projectId: z.string(),
  generatedAt: z.number(),
  youtube: YouTubeSchema,
  instagram: InstagramSchema,
  tiktok: TikTokSchema,
  pinterest: PinterestSchema,
  x: XSchema,
  linkedin: LinkedInSchema,
  facebook: FacebookSchema,
  generic: GenericSchema,
  textOverlays: z.record(z.string(), z.any()).optional(),
});

export type DistributionPackage = z.infer<typeof DistributionPackageSchema>;

/** Standalone single-platform post — no full production/World Bible required. */
export const SocialPostSchema = z.object({
  post: z.string(),
  hashtags: z.array(z.string()),
  imagePromptConcept: z.string(),
});
export type SocialPost = z.infer<typeof SocialPostSchema>;

/** Standalone YouTube kit — title/description/tags for a one-shot video + thumbnail. */
export const YouTubeKitCopySchema = z.object({
  titles: z.array(z.string()).min(3).max(5),
  description: z.string(),
  tags: z.array(z.string()),
  thumbnailConcept: z.string(),
});
export type YouTubeKitCopy = z.infer<typeof YouTubeKitCopySchema>;