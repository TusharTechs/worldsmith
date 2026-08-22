import { adminDb } from "./credits-store";

export interface Character {
  id: string;
  uid: string;
  name: string;
  description: string;
  sheetUri: string;
  createdAt: number;
}

const col = () => adminDb().collection("characters");

export async function saveCharacter(c: Character): Promise<void> {
  await col().doc(c.id).set(c);
}

export async function listCharacters(uid: string): Promise<Character[]> {
  const snap = await col().where("uid", "==", uid).get();
  return snap.docs.map((d) => d.data() as Character).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCharacter(uid: string, id: string): Promise<Character | null> {
  const snap = await col().doc(id).get();
  if (!snap.exists) return null;
  const c = snap.data() as Character;
  return c.uid === uid ? c : null;
}

export async function deleteCharacter(uid: string, id: string): Promise<void> {
  const c = await getCharacter(uid, id);
  if (!c) return;
  await col().doc(id).delete();
}
