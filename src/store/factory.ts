import { ProjectStore } from "./project-store";
import { FirestoreProjectStore, isFirebaseConfigured } from "./firestore-project-store";
import { ServerBackedLocalStore } from "./server-backed-local-store";

/** Client-safe factory. Reads go direct to Firestore, or via server actions in local mode. */
export function createProjectStore(): ProjectStore {
  if (isFirebaseConfigured()) {
    try {
      return new FirestoreProjectStore();
    } catch (e) {
      console.error("Firebase init failed, falling back to server-backed local", e);
    }
  }
  return new ServerBackedLocalStore();
}