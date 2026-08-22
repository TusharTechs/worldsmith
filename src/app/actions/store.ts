"use server";

import { createServerProjectStore } from "@/store/server-factory";
import { isFirebaseConfigured } from "@/store/firestore-project-store";
import { researchProviderMode } from "@/providers/research-factory";
import { Project } from "@/core/project-schemas";
import { Asset } from "@/core/asset-schemas";
import { verifyUser } from "@/store/credits-store";

/** Only used by ServerBackedLocalStore (no client-side Firebase config). idToken may be null
 *  while auth is still resolving on first load — every function below just returns "nothing
 *  visible yet" rather than throwing in that case. */
async function uidFrom(idToken: string | null): Promise<string | null> {
  if (!idToken) return null;
  try { return (await verifyUser(idToken)).uid; } catch { return null; }
}

export async function serverListProjects(idToken: string | null): Promise<Project[]> {
  const uid = await uidFrom(idToken);
  if (!uid) return [];
  const all = await createServerProjectStore().listProjects();
  return all.filter((p) => p.ownerUid === uid);
}

export async function serverGetProject(idToken: string | null, id: string): Promise<Project | null> {
  const store = createServerProjectStore();
  const p = await store.getProject(id);
  if (!p) return null;
  if (!p.ownerUid) return null; // unowned/legacy — not visible until claimed
  const uid = await uidFrom(idToken);
  if (uid !== p.ownerUid) return null;
  return p;
}

export async function serverDeleteProject(idToken: string | null, id: string): Promise<void> {
  const uid = await uidFrom(idToken);
  if (!uid) throw new Error("Sign in required");
  const store = createServerProjectStore();
  const p = await store.getProject(id);
  if (!p) return;
  if (p.ownerUid && p.ownerUid !== uid) throw new Error("You don't have access to this project");
  await store.deleteProject(id); // cascade-deletes assets + files at the store layer
}

export async function serverListAssets(idToken: string | null, projectId: string): Promise<Asset[]> {
  const store = createServerProjectStore();
  const p = await store.getProject(projectId);
  if (!p?.ownerUid) return [];
  const uid = await uidFrom(idToken);
  if (uid !== p.ownerUid) return [];
  return store.listAssets(projectId);
}

export async function serverGetModes(): Promise<{ llm: string; research: "PARALLEL" | "MOCK"; persistence: "FIRESTORE" | "LOCAL" }> {
  return {
    llm: process.env.LLM_PROVIDER ?? "gemini",
    research: researchProviderMode(),
    persistence: isFirebaseConfigured() ? "FIRESTORE" : "LOCAL",
  };
}
