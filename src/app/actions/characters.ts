"use server";

import { createImageProvider } from "@/providers/image-factory";
import { storeImage } from "@/providers/image-storage";
import { estimateCredits } from "@/core/credits";
import { verifyUser, spendCredits } from "@/store/credits-store";
import { saveCharacter, listCharacters, getCharacter, deleteCharacter, Character } from "@/store/characters-store";

const HERO = { width: 1024, height: 1024 };

/**
 * Cast: build a reusable character once, then drop it into any new scene with one click — the
 * same "different scenes, same star" idea as the reference-image tools, but persisted so you
 * don't have to re-upload/re-describe the character every time.
 */
export async function serverCreateCharacter(
  idToken: string,
  name: string,
  description: string,
  referenceDataUrls: string[] = []
): Promise<Character> {
  const cr = estimateCredits("image");
  const u = await verifyUser(idToken);
  const uid = u.uid;
  const settle = await spendCredits(uid, cr);
  if (!settle.ok) throw new Error(`Insufficient credits — need ${cr}, you have ${settle.balance}.`);

  const provider = createImageProvider();
  const prompt = [
    `Character reference sheet for "${name}".`,
    description,
    "Consistent design, neutral studio background, front-facing, cinematic lighting, highly detailed.",
  ].join(" ");
  const img = await provider.generate({
    prompt,
    negativePrompt: "multiple people, text, watermark, inconsistent features",
    width: HERO.width,
    height: HERO.height,
    importance: "HERO",
    references: referenceDataUrls,
  });

  const character: Character = {
    id: `char-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uid,
    name,
    description,
    sheetUri: img.uri,
    createdAt: Date.now(),
  };
  await saveCharacter(character);
  return character;
}

export async function serverListCharacters(idToken: string): Promise<Character[]> {
  const u = await verifyUser(idToken);
  return listCharacters(u.uid);
}

export async function serverDeleteCharacter(idToken: string, id: string): Promise<void> {
  const u = await verifyUser(idToken);
  await deleteCharacter(u.uid, id);
}

/** "Different scenes, same star" — generate the saved character into a brand-new scene. */
export async function serverGenerateCharacterScene(
  idToken: string,
  characterId: string,
  scenePrompt: string,
  width = 1280,
  height = 720
): Promise<{ uri: string; costUSD: number; credits: number; provider: string; model: string }> {
  const cr = estimateCredits("image");
  const u = await verifyUser(idToken);
  const character = await getCharacter(u.uid, characterId);
  if (!character) throw new Error("Character not found");

  const settle = await spendCredits(u.uid, cr);
  if (!settle.ok) throw new Error(`Insufficient credits — need ${cr}, you have ${settle.balance}.`);

  const fetchable = character.sheetUri.startsWith("/api/")
    ? `http://localhost:3000${character.sheetUri}`
    : character.sheetUri;

  const provider = createImageProvider();
  const img = await provider.generate({
    prompt: `${character.name}: ${character.description}. Scene: ${scenePrompt}. Keep the character's appearance perfectly consistent with the reference. Cinematic, highly detailed.`,
    negativePrompt: "inconsistent appearance, text, watermark",
    width,
    height,
    importance: "HERO",
    references: [fetchable],
  });

  return { uri: img.uri, costUSD: img.costUSD, credits: cr, provider: img.provider, model: img.model };
}
