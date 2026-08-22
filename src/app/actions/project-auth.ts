"use server";

import { verifyUser } from "@/store/credits-store";
import { createServerProjectStore } from "@/store/server-factory";
import { ProjectStore } from "@/store/project-store";
import { Project } from "@/core/project-schemas";

/**
 * Every mutating production/generation server action funnels through here: verify the caller's
 * Firebase ID token, load the project, and refuse to act on a project owned by someone else.
 * A project with no owner yet (e.g. a legacy/orphaned record) is auto-claimed by the first
 * verified caller that touches it — mirrors the old (unsafe) serverClaimProject behavior, but
 * now the uid comes from a verified token instead of a client-supplied string.
 */
export async function requireProjectOwner(
  idToken: string,
  projectId: string
): Promise<{ uid: string; project: Project; store: ProjectStore }> {
  const u = await verifyUser(idToken);
  const store = createServerProjectStore();
  const project = await store.getProject(projectId);
  if (!project) throw new Error("Project not found");
  if (project.ownerUid && project.ownerUid !== u.uid) {
    throw new Error("You don't have access to this project");
  }
  if (!project.ownerUid) {
    const claimed = await store.updateProject(projectId, { ownerUid: u.uid } as Partial<Project>);
    return { uid: u.uid, project: claimed ?? project, store };
  }
  return { uid: u.uid, project, store };
}
