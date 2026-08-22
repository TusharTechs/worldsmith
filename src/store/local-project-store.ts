import { z } from "zod";
import { ProjectStore } from "./project-store";
import { parseProjectWithMigration, Project } from "@/core/project-schemas";
import { Asset, AssetSchema } from "@/core/asset-schemas";

const PROJECTS_KEY = "worldsmith_projects_v1";
const ASSETS_KEY = "worldsmith_assets_v1";

export class LocalProjectStore implements ProjectStore {
  mode: "LOCAL" | "FIRESTORE" = "LOCAL";

  private getAll(): Project[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PROJECTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((p) => parseProjectWithMigration(p)).filter(Boolean) as Project[];
    } catch (e) {
      console.error("Failed to parse local projects", e);
      return [];
    }
  }

  private saveAll(projects: Project[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  }

  private getAllAssets(): Record<string, Asset[]> {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem(ASSETS_KEY);
      if (!raw) return {};
      const res = z.record(z.string(), z.array(AssetSchema)).safeParse(JSON.parse(raw));
      return res.success ? res.data : {};
    } catch {
      return {};
    }
  }

  private saveAllAssets(map: Record<string, Asset[]>) {
    if (typeof window === "undefined") return;
    localStorage.setItem(ASSETS_KEY, JSON.stringify(map));
  }

  async createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    const projects = this.getAll();
    const newProject: Project = {
      ...data,
      id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    projects.unshift(newProject);
    this.saveAll(projects);
    return newProject;
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    const projects = this.getAll();
    const idx = projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    projects[idx] = { ...projects[idx], ...data, updatedAt: Date.now() };
    this.saveAll(projects);
    return projects[idx];
  }

  async getProject(id: string): Promise<Project | null> {
    return this.getAll().find((p) => p.id === id) || null;
  }

  async listProjects(): Promise<Project[]> {
    return this.getAll();
  }

  async deleteProject(id: string): Promise<void> {
    this.saveAll(this.getAll().filter((p) => p.id !== id));
    const assets = this.getAllAssets();
    delete assets[id];
    this.saveAllAssets(assets);
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    const map = this.getAllAssets();
    const list = map[asset.projectId] ?? [];
    const idx = list.findIndex((a) => a.id === asset.id);
    if (idx >= 0) list[idx] = asset;
    else list.push(asset);
    map[asset.projectId] = list;
    this.saveAllAssets(map);
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    return this.getAllAssets()[projectId] ?? [];
  }
}