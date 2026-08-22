import { Project } from "@/core/project-schemas";
import { Asset } from "@/core/asset-schemas";

export interface ProjectStore {
  mode: "LOCAL" | "FIRESTORE";
  /** Implemented only by stores that need an explicit ID token to authorize server actions
   *  (currently ServerBackedLocalStore). No-op for stores that get auth another way. */
  setIdTokenGetter?(getter: () => Promise<string | null>): void;
  createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | null>;
  getProject(id: string): Promise<Project | null>;
  listProjects(): Promise<Project[]>;
  deleteProject(id: string): Promise<void>;
  saveAsset(asset: Asset): Promise<Asset>;
  listAssets(projectId: string): Promise<Asset[]>;
}