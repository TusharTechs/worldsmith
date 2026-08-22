import { ProjectStore } from "./project-store";
import { AdminFirestoreStore, isAdminConfigured } from "./admin-firestore-store";
import { FirestoreProjectStore, isFirebaseConfigured } from "./firestore-project-store";
import { FileProjectStore } from "./file-project-store";

/** Server-only. Admin SDK first (REST, stream-free), then client SDK, then file. */
export function createServerProjectStore(): ProjectStore {
  if (isAdminConfigured()) {
    try {
      return new AdminFirestoreStore();
    } catch (e) {
      console.error("Admin Firestore init failed, falling back", e);
    }
  }
  if (isFirebaseConfigured()) {
    try {
      return new FirestoreProjectStore();
    } catch (e) {
      console.error("Firebase init failed on server, falling back to file store", e);
    }
  }
  return new FileProjectStore();
}