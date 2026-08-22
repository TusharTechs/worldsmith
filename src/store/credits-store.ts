import { initializeApp, getApps, cert } from "firebase-admin/app";
import { initializeFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { resolveVertexConfig, resolveServiceAccount } from "@/providers/vertex-provider";
import { FREE_TRIAL_CREDITS } from "@/core/credits";

const APP_NAME = "worldsmith-credits-v2";

function adminApp() {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const cfg = resolveVertexConfig();
  const sa = resolveServiceAccount();
  return initializeApp(
    {
      credential: cert(sa),
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? cfg.projectId,
    },
    APP_NAME
  );
}

/**
 * gRPC is flaky in server environments — force HTTP long-polling
 * (same transport fix as firestore-project-store).
 * initializeFirestore may only run once per app, so cache the instance.
 */
let _db: Firestore | null = null;
export function adminDb(): Firestore {
  if (!_db) {
    _db = initializeFirestore(
      adminApp(),
      { preferRest: true, ignoreUndefinedProperties: true } as any
    );
  }
  return _db;
}

export async function verifyUser(idToken: string) {
  return getAuth(adminApp()).verifyIdToken(idToken);
}

const userRef = (uid: string) => adminDb().collection("users").doc(uid);

export async function ensureUser(uid: string, email: string): Promise<void> {
  const ref = userRef(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ uid, email, credits: FREE_TRIAL_CREDITS, plan: "free", createdAt: Date.now() });
  }
}

/**
 * One billing cycle after `from`, clamped to the end of the target month.
 *
 * Plain setMonth(+1) turns 31 January into 3 March, which would show a subscriber a renewal date
 * that does not exist in their month. Clamping keeps it on the last day instead.
 */
export function addCycle(from: number, cycle: string): number {
  const d = new Date(from);
  const day = d.getDate();
  if (cycle === "annual") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  if (d.getDate() < day) d.setDate(0); // rolled into the next month — step back to its last day
  return d.getTime();
}

/** Plan, cycle and renewal date together, so the UI needs one round trip rather than three. */
export async function getUserAccount(uid: string): Promise<{
  credits: number; plan: string; planCycle: string; renewsAt: number | null; subActive: boolean;
}> {
  const snap = await userRef(uid).get();
  const d = snap.exists ? (snap.data() ?? {}) : {};
  return {
    credits: d.credits ?? 0,
    plan: d.plan ?? "free",
    planCycle: d.planCycle ?? "monthly",
    renewsAt: typeof d.renewsAt === "number" ? d.renewsAt : null,
    subActive: d.subActive !== false,
  };
}

export async function getUserCredits(uid: string): Promise<number> {
  const snap = await userRef(uid).get();
  return snap.exists ? (snap.data()?.credits ?? 0) : 0;
}

export async function getUserPlan(uid: string): Promise<string> {
  const snap = await userRef(uid).get();
  return snap.exists ? (snap.data()?.plan ?? "free") : "free";
}

/** Atomic decrement; rejects if insufficient. */
export async function spendCredits(uid: string, amount: number): Promise<{ ok: boolean; balance: number }> {
  const db = adminDb();
  const ref = userRef(uid);
  let ok = false;
  let balance = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists ? (snap.data()?.credits ?? 0) : FREE_TRIAL_CREDITS;
    if (!snap.exists) tx.set(ref, { uid, credits: FREE_TRIAL_CREDITS, plan: "free", createdAt: Date.now() });
    if (cur >= amount) { tx.update(ref, { credits: cur - amount }); ok = true; balance = cur - amount; }
    else balance = cur;
  });
  return { ok, balance };
}

export async function grantCredits(uid: string, amount: number, plan?: string): Promise<void> {
  const db = adminDb();
  const ref = userRef(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.update(ref, { credits: (snap.data()?.credits ?? 0) + amount, ...(plan ? { plan } : {}) });
    else tx.set(ref, { uid, credits: amount, plan: plan ?? "free", createdAt: Date.now() });
  });
}

export async function setPlan(uid: string, plan: string, credits: number): Promise<void> {
  await userRef(uid).set({ plan, credits, renewalAt: Date.now() }, { merge: true });
}

export async function getUserDoc(uid: string): Promise<any | null> {
  const snap = await userRef(uid).get();
  return snap.exists ? snap.data() : null;
}

/* ─────────────────────────── promo / coupon codes ───────────────────────────
 * A code is a doc in `promoCodes` keyed by the code itself. Each redemption writes a
 * `promoRedemptions/{uid}_{code}` doc inside the same transaction that grants the credits —
 * that doc is the idempotency guard, so a double-click or a replayed request can never
 * grant twice, and the per-code counter can't drift past maxRedemptions under concurrency.
 */

export interface PromoCode {
  code: string;
  credits: number;
  active: boolean;
  /** 0 / undefined == unlimited */
  maxRedemptions?: number;
  redemptionCount?: number;
  /** epoch ms; undefined == never expires */
  expiresAt?: number;
  note?: string;
  createdAt: number;
}

export type RedeemResult =
  | { ok: true; credits: number; balance: number }
  | { ok: false; error: string };

/** Codes are case- and punctuation-insensitive so "worldsmith 20" and "WORLDSMITH-20" both work. */
export function normalizePromoCode(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function redeemPromoCode(uid: string, raw: string): Promise<RedeemResult> {
  const code = normalizePromoCode(raw);
  if (!code) return { ok: false, error: "Enter a code to redeem." };

  const db = adminDb();
  const promoRef = db.collection("promoCodes").doc(code);
  const claimRef = db.collection("promoRedemptions").doc(`${uid}_${code}`);
  const uRef = userRef(uid);

  let result: RedeemResult = { ok: false, error: "That code could not be redeemed." };

  await db.runTransaction(async (tx) => {
    // every read first — Firestore transactions forbid reads after writes
    const [promoSnap, claimSnap, userSnap] = await tx.getAll(promoRef, claimRef, uRef);

    if (!promoSnap.exists) {
      result = { ok: false, error: "That code isn't valid." };
      return;
    }
    const p = promoSnap.data() as PromoCode;

    if (p.active === false) {
      result = { ok: false, error: "That code is no longer active." };
      return;
    }
    if (p.expiresAt && Date.now() > p.expiresAt) {
      result = { ok: false, error: "That code has expired." };
      return;
    }
    if (claimSnap.exists) {
      result = { ok: false, error: "You've already redeemed this code." };
      return;
    }
    const used = p.redemptionCount ?? 0;
    if (p.maxRedemptions && used >= p.maxRedemptions) {
      result = { ok: false, error: "This code has been fully claimed." };
      return;
    }
    const amount = Number(p.credits) || 0;
    if (amount <= 0) {
      result = { ok: false, error: "That code has no credits attached." };
      return;
    }

    const current = userSnap.exists ? (userSnap.data()?.credits ?? 0) : FREE_TRIAL_CREDITS;
    const balance = current + amount;

    tx.set(claimRef, { uid, code, credits: amount, at: Date.now() });
    tx.update(promoRef, { redemptionCount: used + 1 });
    if (userSnap.exists) tx.update(uRef, { credits: balance });
    else tx.set(uRef, { uid, credits: balance, plan: "free", createdAt: Date.now() });

    result = { ok: true, credits: amount, balance };
  });

  return result;
}

/** Create or update a code. Owner-gated at the action layer. */
export async function upsertPromoCode(input: {
  code: string; credits: number; maxRedemptions?: number; expiresAt?: number; note?: string; active?: boolean;
}): Promise<PromoCode> {
  const code = normalizePromoCode(input.code);
  if (!code) throw new Error("A code is required");
  const ref = adminDb().collection("promoCodes").doc(code);
  const existing = await ref.get();

  // Firestore rejects an explicit `undefined` value, so optional fields are omitted from the
  // object entirely rather than written as undefined.
  const doc: PromoCode = {
    code,
    credits: Math.max(0, Math.floor(input.credits)),
    active: input.active ?? true,
    redemptionCount: existing.exists ? (existing.data()?.redemptionCount ?? 0) : 0,
    createdAt: existing.exists ? (existing.data()?.createdAt ?? Date.now()) : Date.now(),
  };
  if (input.maxRedemptions && input.maxRedemptions > 0) doc.maxRedemptions = Math.floor(input.maxRedemptions);
  if (input.expiresAt) doc.expiresAt = input.expiresAt;
  if (input.note && input.note.trim()) doc.note = input.note.trim();

  await ref.set(doc, { merge: true });
  return doc;
}

export async function listPromoCodes(): Promise<PromoCode[]> {
  const snap = await adminDb().collection("promoCodes").get();
  return snap.docs.map((d) => d.data() as PromoCode).sort((a, b) => b.createdAt - a.createdAt);
}

export interface UserProfile {
  username?: string;
  headline?: string;
  bio?: string;
}

export async function getUserProfile(uid: string): Promise<UserProfile> {
  const snap = await userRef(uid).get();
  if (!snap.exists) return {};
  const d = snap.data() ?? {};
  return { username: d.username, headline: d.headline, bio: d.bio };
}

export async function updateUserProfile(uid: string, fields: UserProfile): Promise<void> {
  await userRef(uid).set(fields, { merge: true });
}

/** Activate/switch a plan: record subscription state and ADD the cycle's credits (never wipe the wallet). */
export async function activatePlan(
  uid: string,
  plan: string,
  creditsToAdd: number,
  cycle?: string,
  /** Renewal date from the payment provider, when the event carries one. */
  providerRenewsAt?: number
): Promise<void> {
  const startedAt = Date.now();
  const resolvedCycle = cycle ?? "monthly";
  // `renewalAt` previously held the activation time despite its name, so it could never be shown
  // as a renewal date. Prefer the provider's own date; fall back to one cycle from activation.
  const renewsAt = providerRenewsAt ?? addCycle(startedAt, resolvedCycle);
  await userRef(uid).set(
    { plan, planCycle: resolvedCycle, subActive: true, startedAt, renewsAt },
    { merge: true }
  );
  await grantCredits(uid, creditsToAdd);
}