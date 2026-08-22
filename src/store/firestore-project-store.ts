import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore, initializeFirestore, collection, doc, addDoc, updateDoc, getDoc, getDocs, deleteDoc, setDoc,
  query, where, Firestore,
} from "firebase/firestore";
import { ProjectStore } from "./project-store";
import { parseProjectWithMigration, Project } from "@/core/project-schemas";
import { Asset, AssetSchema } from "@/core/asset-schemas";

let app: FirebaseApp | undefined;
let db: Firestore | undefined;

export const isFirebaseConfigured = (): boolean => {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    !process.env.NEXT_PUBLIC_FIREBASE_API_KEY.startsWith("undefined")
  );
};

const initFirebase = () => {
  if (!isFirebaseConfigured()) return false;
  if (!app) {
    app =
      getApps().length === 0
        ? initializeApp({
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          })
        : getApps()[0];

    if (typeof window === "undefined") {
      // Node server: gRPC write streams are flaky in server environments.
      // Force HTTP long-polling; tolerate stray undefined as defense-in-depth.
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
        ignoreUndefinedProperties: true,
      });
    } else {
      db = getFirestore(app); // browser keeps its default transport
    }
  }
  return true;
};

// Firestore rejects `undefined` field values; strip them recursively before every write.
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => stripUndefined(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as unknown as T;
  }
  return value;
}

export class FirestoreProjectStore implements ProjectStore {
  mode: "LOCAL" | "FIRESTORE" = "FIRESTORE";

  constructor() {
    if (!initFirebase()) throw new Error("Firebase is not configured");
  }

  private col() {
    return collection(db!, "projects");
  }

  private toProject(snap: any): Project | null {
    return parseProjectWithMigration({ id: snap.id, ...snap.data() });
  }

  async createProject(data: Omit<Project, "id" | "createdAt" | "updatedAt">): Promise<Project> {
    const payload = { ...data, createdAt: Date.now(), updatedAt: Date.now() };
    const docRef = await addDoc(this.col(), stripUndefined(payload));
    return { ...payload, id: docRef.id };
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    const docRef = doc(db!, "projects", id);
    await updateDoc(docRef, stripUndefined({ ...data, updatedAt: Date.now() }));
    const updatedDoc = await getDoc(docRef);
    return updatedDoc.exists() ? this.toProject(updatedDoc) : null;
  }

  async getProject(id: string): Promise<Project | null> {
    const snap = await getDoc(doc(db!, "projects", id));
    return snap.exists() ? this.toProject(snap) : null;
  }

  /**
   * Scoped to the signed-in user's own projects. This is defense-in-depth, not the primary
   * guard — the actual security boundary is firestore.rules (resource.data.ownerUid ==
   * request.auth.uid), which also stops a client from querying around this filter. With no
   * signed-in user there's nothing this account can see, so return empty rather than querying
   * unfiltered.
   */
  async listProjects(): Promise<Project[]> {
    const uid = getAuth(db!.app).currentUser?.uid;
    if (!uid) return [];
    // Sorted client-side rather than via `orderBy` so this doesn't need a composite Firestore
    // index (equality filter + orderBy on a different field) — fine at this per-user scale.
    const snap = await getDocs(query(this.col(), where("ownerUid", "==", uid)));
    const out: Project[] = [];
    for (const d of snap.docs) {
      const p = this.toProject(d);
      if (!p) {
        console.warn("[STORE] project doc failed schema parse (hidden from UI):", d.id);
        continue;
      }
      out.push(p);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Cascade delete: the assets subcollection first (Firestore doesn't cascade-delete
   * subcollections on its own), then the project doc. Underlying storage bytes for
   * cloud-stored assets are left to expire via their signed URL TTL rather than deleted here —
   * doing that safely needs the Admin SDK, which this client-side store can't use.
   */
  async deleteProject(id: string): Promise<void> {
    const assetsSnap = await getDocs(collection(db!, "projects", id, "assets"));
    for (const a of assetsSnap.docs) await deleteDoc(a.ref);
    await deleteDoc(doc(db!, "projects", id));
  }

  async saveAsset(asset: Asset): Promise<Asset> {
    await setDoc(doc(db!, "projects", asset.projectId, "assets", asset.id), stripUndefined(asset));
    return asset;
  }

  async listAssets(projectId: string): Promise<Asset[]> {
    const snap = await getDocs(collection(db!, "projects", projectId, "assets"));
    return snap.docs
      .map((d) => {
        const res = AssetSchema.safeParse({ id: d.id, ...d.data() });
        return res.success ? res.data : null;
      })
      .filter(Boolean) as Asset[];
  }
}