import fs from "fs";
import path from "path";
import { z } from "zod";
import { ProjectStore } from "./project-store";
import { parseProjectWithMigration, Project } from "@/core/project-schemas";
import { Asset, AssetSchema } from "@/core/asset-schemas";
import { deleteStoredAsset } from "@/providers/image-storage";
import { withProjectLock } from "./mutex";

const FILE_PATH = path.join(process.cwd(), ".data", "worldsmith.json");

interface FileDB {
  projects: Project[];
  assets: Record<string, Asset[]>;
}

function readDB(): FileDB {
  try {
    const raw = fs.readFileSync(FILE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const projects = Array.isArray(parsed.projects)
      ? (parsed.projects.map((p: unknown) => parseProjectWithMigration(p)).filter(Boolean) as Project[])
      : [];
    const assetsRes = z.record(z.string(), z.array(AssetSchema)).safeParse(parsed.assets ?? {});
    return { projects, assets: assetsRes.success ? assetsRes.data : {} };
  } catch {
    return { projects: [], assets: {} };
  }
}

function writeDB(db: FileDB) {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(db, null, 2));
}

export class FileProjectStore implements ProjectStore {
  mode: "LOCAL" | "FIRESTORE" = "LOCAL";

  async createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    const db = readDB();
    const project: Project = {
      ...data,
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    db.projects.unshift(project);
    writeDB(db);
    return project;
  }

  /** Serialized per project id — see mutex.ts for why. */
  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    return withProjectLock(id, async () => {
      const db = readDB();
      const idx = db.projects.findIndex((p) => p.id === id);
      if (idx === -1) return null;
      db.projects[idx] = { ...db.projects[idx], ...data, updatedAt: Date.now() };
      writeDB(db);
      return db.projects[idx];
    });
  }

  async getProject(id: string): Promise<Project | null> {
    return readDB().projects.find((p) => p.id === id) ?? null;
  }

  async listProjects(): Promise<Project[]> {
    return readDB().projects;
  }

  /** Cascade delete: every asset's stored file, then its record, then the project. */
  async deleteProject(id: string): Promise<void> {
    const db = readDB();
    for (const a of db.assets[id] ?? []) await deleteStoredAsset(a.uri);
    db.projects = db.projects.filter((p) => p.id !== id);
    delete db.assets[id];
    writeDB(db);
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    const db = readDB();
    const list = db.assets[asset.projectId] ?? [];
    const idx = list.findIndex((a) => a.id === asset.id);
    if (idx >= 0) list[idx] = asset;
    else list.push(asset);
    db.assets[asset.projectId] = list;
    writeDB(db);
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    return readDB().assets[projectId] ?? [];
  }
}