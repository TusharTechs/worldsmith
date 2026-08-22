import { ProjectStore } from "./project-store";
import { Project } from "@/core/project-schemas";
import { Asset } from "@/core/asset-schemas";
import { serverListProjects, serverGetProject, serverDeleteProject, serverListAssets } from "@/app/actions/store";

export class ServerBackedLocalStore implements ProjectStore {
  mode: "LOCAL" | "FIRESTORE" = "LOCAL";
  private getIdToken: () => Promise<string | null> = async () => null;

  setIdTokenGetter(getter: () => Promise<string | null>): void {
    this.getIdToken = getter;
  }

  async createProject(_data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    throw new Error("Server-only operation");
  }
  async updateProject(_id: string, _data: Partial<Project>): Promise<Project | null> {
    throw new Error("Server-only operation");
  }
  async saveAsset(_asset: Asset): Promise<Asset> {
    throw new Error("Server-only operation");
  }

  async getProject(id: string): Promise<Project | null> {
    return serverGetProject(await this.getIdToken(), id);
  }
  async listProjects(): Promise<Project[]> {
    return serverListProjects(await this.getIdToken());
  }
  async deleteProject(id: string): Promise<void> {
    return serverDeleteProject(await this.getIdToken(), id);
  }
  async listAssets(projectId: string): Promise<Asset[]> {
    return serverListAssets(await this.getIdToken(), projectId);
  }
}
