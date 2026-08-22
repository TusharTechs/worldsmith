import path from "path";
import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { ProjectStore } from "./project-store";
import { parseProjectWithMigration, Project } from "@/core/project-schemas";
import { Asset, AssetSchema } from "@/core/asset-schemas";
import { stripUndefined } from "./firestore-project-store";
import { deleteStoredAsset } from "@/providers/image-storage";
import { withProjectLock } from "./mutex";

const APP_NAME = "worldsmith-admin";

let db: Firestore | undefined;

export const isAdminConfigured = (): boolean => {
  return (
    !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    require("fs").existsSync(path.join(process.cwd(), "firebase-service-account.json"))
  );
};

const initAdmin = (): boolean => {
  if (!isAdminConfigured()) return false;
  if (!db) {
    const existing = getApps().find((a) => a.name === APP_NAME);
    const app: App =
      existing ??
      initializeApp(
        {
          credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
            ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
            : cert(path.join(process.cwd(), "firebase-service-account.json")),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        },
        APP_NAME
      );
    db = getFirestore(app);
    try {
      // REST-only: no persistent gRPC streams in server environments
      db.settings({ preferRest: true });
    } catch {
      // settings already applied (HMR re-evaluation) — fine
    }
  }
  return true;
};

export class AdminFirestoreStore implements ProjectStore {
  mode: "LOCAL" | "FIRESTORE" = "FIRESTORE";

  constructor() {
    if (!initAdmin()) throw new Error("Firebase Admin is not configured");
  }

  private col() {
    return db!.collection("projects");
  }

  private toProject(id: string, data: any): Project | null {
    return parseProjectWithMigration({ id, ...data });
  }

  async createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    const payload = stripUndefined({ ...data, createdAt: Date.now(), updatedAt: Date.now() });
    const ref = await this.col().add(payload);
    return { ...payload, id: ref.id } as Project;
  }

  /**
   * Serialized per project id: two concurrent updates on the SAME project (e.g. a retry firing
   * while a generation batch is still writing costLedger/actualCostUSD) queue instead of racing —
   * `set(..., merge:true)` still replaces array fields wholesale, so interleaved read-modify-write
   * of costLedger would otherwise silently drop entries.
   */
  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    return withProjectLock(id, async () => {
      const ref = this.col().doc(id);
      await ref.set(stripUndefined({ ...data, updatedAt: Date.now() }), { merge: true });
      const snap = await ref.get();
      return snap.exists ? this.toProject(id, snap.data()) : null;
    });
  }

  async getProject(id: string): Promise<Project | null> {
    const snap = await this.col().doc(id).get();
    return snap.exists ? this.toProject(id, snap.data()) : null;
  }

  async listProjects(): Promise<Project[]> {
    const snap = await this.col().orderBy("createdAt", "desc").get();
    return snap.docs.map((d) => this.toProject(d.id, d.data())).filter(Boolean) as Project[];
  }

  /** Cascade delete: every asset's stored file, its subcollection doc, then the project doc. */
  async deleteProject(id: string): Promise<void> {
    const assets = await this.listAssets(id);
    for (const a of assets) {
      await deleteStoredAsset(a.uri);
      await this.col().doc(id).collection("assets").doc(a.id).delete();
    }
    await this.col().doc(id).delete();
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    await this.col()
      .doc(asset.projectId)
      .collection("assets")
      .doc(asset.id)
      .set(stripUndefined(asset));
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    const snap = await this.col().doc(projectId).collection("assets").get();
    return snap.docs
      .map((d) => {
        const res = AssetSchema.safeParse({ id: d.id, ...d.data() });
        return res.success ? res.data : null;
      })
      .filter(Boolean) as Asset[];
  }
}