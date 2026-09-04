"use server";
import {
  verifyUser, ensureUser, getUserAccount, spendCredits,
  grantCredits, activatePlan, adminDb, getUserProfile, updateUserProfile, type UserProfile,
  redeemPromoCode, upsertPromoCode, listPromoCodes, type RedeemResult, type PromoCode,
} from "@/store/credits-store";
import { PACKS, PLANS } from "@/core/credits";
import { isTestBilling } from "@/core/billing-mode";
import { storeImage } from "@/providers/image-storage";

export type CheckoutItem = { kind: "plan" | "pack"; id: string; cycle?: "monthly" | "annual" };

/**
 * Outcome of a manual "already paid?" claim. `reason` lets the UI say something a customer can
 * act on; `detail` is an operator-facing trace kept out of the way behind a disclosure.
 */
export type ClaimResult = {
  granted: string | null;
  reason: "granted" | "test-mode" | "unverified-email" | "no-match";
  email: string;
  /** True when billing is in test mode: the purchase was matched but no credits were moved. */
  testMode?: boolean;
  detail?: string;
};

const dodoBase = () =>
  (process.env.DODO_MODE ?? "test") === "live"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function serverGetCredits(
  idToken: string
): Promise<{ credits: number; plan: string; planCycle: string; renewsAt: number | null; subActive: boolean }> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  return getUserAccount(u.uid);
}

export async function serverSpendCredits(idToken: string, amount: number): Promise<{ ok: boolean; balance: number }> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  return spendCredits(u.uid, amount);
}

/* ───────────── promo codes ───────────── */

export async function serverRedeemPromo(idToken: string, code: string): Promise<RedeemResult> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  return redeemPromoCode(u.uid, code);
}

/**
 * True only for the single configured owner account — gates promo-code management.
 *
 * The email is read off the *verified* Firebase ID token, never from client input, so it can't
 * be spoofed. Prefers OWNER_EMAIL and falls back to LEGACY_OWNER_EMAIL (which exists for an
 * unrelated project-claim migration) so the two concerns can be separated later without
 * changing behaviour today. Fails closed if neither is set.
 */
async function isOwner(idToken: string): Promise<boolean> {
  const allowed = process.env.OWNER_EMAIL ?? process.env.LEGACY_OWNER_EMAIL;
  if (!allowed) return false;
  const u = await verifyUser(idToken);
  return (u.email ?? "").toLowerCase() === allowed.trim().toLowerCase();
}

export async function serverIsOwner(idToken: string): Promise<boolean> {
  return isOwner(idToken);
}

export async function serverListPromoCodes(idToken: string): Promise<PromoCode[]> {
  if (!(await isOwner(idToken))) throw new Error("Not authorized");
  return listPromoCodes();
}

export async function serverUpsertPromoCode(
  idToken: string,
  input: { code: string; credits: number; maxRedemptions?: number; expiresAt?: number; note?: string; active?: boolean }
): Promise<PromoCode> {
  if (!(await isOwner(idToken))) throw new Error("Not authorized");
  return upsertPromoCode(input);
}

export async function serverGetProfile(idToken: string): Promise<UserProfile> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  return getUserProfile(u.uid);
}

export async function serverUpdateProfile(idToken: string, fields: UserProfile): Promise<void> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  const username = fields.username?.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24);
  const headline = fields.headline?.trim().slice(0, 60);
  const bio = fields.bio?.trim().slice(0, 300);
  await updateUserProfile(u.uid, { username, headline, bio });
}

export async function serverUploadProfilePhoto(idToken: string, dataUrl: string): Promise<string> {
  await verifyUser(idToken);
  // Server Actions choke on very large string arguments (Next.js's Flight serialization has an
  // internal size/nesting limit) — the client is expected to downscale first, but guard here too
  // so an oversized upload fails with a clear message instead of a cryptic framework error.
  if (dataUrl.length > 2_000_000) throw new Error("Image too large — please use a smaller photo.");
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "image/png";
  return storeImage(Buffer.from(b64, "base64"), mime);
}

export async function applyPurchaseRule(uid: string, rule: any, providerRenewsAt?: number): Promise<string> {
  if (!rule) return "nothing";
  // Every path that could add credits comes through here — the webhook and the manual claim
  // both call it — so this is the one place the test-mode gate has to hold. The purchase is
  // still recognised and described; only the grant is withheld.
  const test = isTestBilling();
  if (rule.type === "pack") {
    const pack = PACKS.find((p) => p.id === rule.pack);
    if (pack) {
      if (!test) await grantCredits(uid, pack.credits);
      return `${pack.credits} credits`;
    }
  } else if (rule.type === "plan") {
    const plan = (PLANS as any)[rule.plan];
    if (plan) {
      if (!test) await activatePlan(uid, rule.plan, plan.credits, rule.cycle, providerRenewsAt);
      return test ? `${plan.name} plan (+${plan.credits} credits)` : `${plan.name} plan active (+${plan.credits} credits)`;
    }
  }
  return "nothing";
}

export async function serverStartCheckout(idToken: string, item: CheckoutItem): Promise<{ url: string }> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  const key = `${item.kind}:${item.id}${item.cycle ? ":" + item.cycle : ""}`;

  await adminDb().collection("checkoutIntents").doc(`${u.uid}_${key}`).set({
    uid: u.uid, email: u.email ?? "", key, at: Date.now(), status: "pending",
  });

  const returnUrl = `${appUrl()}/billing/success`;
  const apiKey = process.env.DODO_API_KEY;
  const ids: Record<string, string> = JSON.parse(process.env.DODO_PRODUCT_IDS ?? "{}");
  const productId = ids[key];

  if (apiKey && productId) {
    try {
      const res = await fetch(`${dodoBase()}/checkouts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          product_cart: [{ product_id: productId, quantity: 1 }],
          return_url: returnUrl,
          cancel_url: appUrl(),
          metadata: { user_uid: u.uid },
          feature_flags: { redirect_immediately: true },
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data?.checkout_url) return { url: data.checkout_url };
      }
      console.error("[BILLING] /checkouts failed:", res.status, await res.text());
    } catch (e) {
      console.error("[BILLING] /checkouts error:", e);
    }
  }

  const links: Record<string, string> = JSON.parse(process.env.DODO_PAYMENT_LINKS ?? "{}");
  const url = links[key];
  if (!url) throw new Error(`Checkout "${key}" not configured.`);
  return { url };
}

/* ---------- Webhook-independent reconciliation ---------- */

async function dodoRecentPayments(): Promise<any[]> {
  const key = process.env.DODO_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${dodoBase()}/payments?limit=50`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[BILLING] list payments failed:", res.status, await res.text());
      return [];
    }
    const data: any = await res.json();
    const arr = Array.isArray(data) ? data : (data.payments ?? data.data ?? data.results ?? []);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error("[BILLING] list payments error:", e);
    return [];
  }
}

function paymentFields(p: any) {
  return {
    id: p.payment_id ?? p.id ?? p.paymentId ?? null,
    status: String(p.status ?? p.payment_status ?? "").toUpperCase(),
    email: p.customer?.email ?? p.customer_email ?? p.email ?? "",
    productId:
      p.product_id ?? p.product?.product_id ?? p.product_cart?.[0]?.product_id ??
      p.items?.[0]?.product_id ?? p.product_id_list?.[0] ?? null,
  };
}

/**
 * Attach a paid purchase to this account.
 * 1) local unclaimed payments recorded by the webhook, then
 * 2) direct reconciliation against Dodo's payments API (webhook-independent).
 * Abandoned checkouts grant NOTHING — only real successful payments.
 */
async function dodoGet(path: string): Promise<{ ok: boolean; status: number; data: any }> {
  const key = process.env.DODO_API_KEY;
  if (!key) return { ok: false, status: 401, data: null };
  try {
    const res = await fetch(`${dodoBase()}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

/**
 * Attach a paid purchase to this account (webhook-independent):
 * 0) local unclaimed payments recorded by webhook
 * 1) direct fetch of the payment/subscription from the return URL ids
 * 2) list fallback
 * Every miss is reported in `detail` for debugging. Abandoned checkouts grant nothing.
 */
export async function serverClaimPurchase(
  idToken: string,
  opts?: { paymentId?: string; subscriptionId?: string }
): Promise<ClaimResult> {
  const u = await verifyUser(idToken);
  await ensureUser(u.uid, u.email ?? "");
  const email = (u.email ?? "").toLowerCase();
  const db = adminDb();
  const map: Record<string, any> = JSON.parse(process.env.DODO_PRODUCT_MAP ?? "{}");
  const diag: string[] = [];

  // The email on the Dodo payment is the only thing linking a purchase to a Worldsmith account,
  // so it has to be a *verified* address. Firebase lets anyone create an email/password account
  // with an address they don't control; without this gate, such an account could claim a
  // stranger's payment. A uid recorded by the webhook (from checkout metadata) is trustworthy on
  // its own and stays claimable either way.
  const emailTrusted = email.length > 0 && u.email_verified === true;

  // Atomic "claim once" guard: only the transaction that actually flips the doc's status
  // is allowed to grant credits, so two concurrent claims for the same payment can't both win.
  const tryGrant = async (payId: string, productId: string | null, status: string, payEmail: string, via: string) => {
    if (!payId) return null;
    if (!/SUCCESS|SUCCEEDED|PAID|CAPTURED|COMPLETED|ACTIVE|TRIALING/.test(String(status).toUpperCase())) {
      diag.push(`${payId}:status=${status}`); return null;
    }
    // Fails closed: no verified account email, or no email on the payment, means no match.
    const payMail = (payEmail ?? "").toLowerCase();
    if (!emailTrusted || !payMail || payMail !== email) { diag.push(`${payId}:email-mismatch`); return null; }
    const rule = map[productId ?? ""];
    if (!rule) { diag.push(`${payId}:no-rule-for=${productId}`); return null; }

    const ref = db.collection("payments").doc(String(payId));
    let won = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) { won = false; return; }
      tx.set(ref, { productId, email: payEmail, rule, status: "claimed", uid: u.uid, at: Date.now(), via });
      won = true;
    });
    if (!won) { diag.push(`${payId}:already-processed`); return null; }
    return applyPurchaseRule(u.uid, rule);
  };

  // 0) webhook-recorded unclaimed — transactionally flip unclaimed→claimed so two concurrent
  // claim calls (e.g. two open tabs) can't both grant the same payment.
  const unclaimedSnap = await db.collection("payments").where("status", "==", "unclaimed").get();
  for (const doc of unclaimedSnap.docs) {
    const p = doc.data();
    if (p.uid === u.uid || (emailTrusted && (p.email ?? "").toLowerCase() === email)) {
      let won = false;
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(doc.ref);
        if (!snap.exists || snap.data()?.status !== "unclaimed") { won = false; return; }
        tx.update(doc.ref, { status: "claimed", uid: u.uid, claimedAt: Date.now() });
        won = true;
      });
      if (!won) continue; // lost the race to a concurrent claim — try the next match, if any
      const granted = await applyPurchaseRule(u.uid, p.rule);
      return { granted, reason: isTestBilling() ? "test-mode" as const : "granted" as const, email, testMode: isTestBilling() };
    }
  }

  // 1) direct fetch by id from the return URL
  if (opts?.paymentId) {
    const r = await dodoGet(`/payments/${opts.paymentId}`);
    if (!r.ok) diag.push(`GET /payments/${opts.paymentId} -> ${r.status}`);
    else {
      const d = r.data ?? {};
      const g = await tryGrant(
        d.payment_id ?? opts.paymentId,
        d.product_id ?? d.product_cart?.[0]?.product_id ?? null,
        d.status ?? "", d.customer?.email ?? d.customer_email ?? "", "direct-payment"
      );
      if (g) return { granted: g, reason: isTestBilling() ? "test-mode" : "granted", email, testMode: isTestBilling(), detail: opts.paymentId };
    }
  }
  if (opts?.subscriptionId) {
    const r = await dodoGet(`/subscriptions/${opts.subscriptionId}`);
    if (!r.ok) diag.push(`GET /subscriptions/${opts.subscriptionId} -> ${r.status}`);
    else {
      const d = r.data ?? {};
      const productId = d.product_id ?? d.product?.product_id ?? d.items?.[0]?.product_id ?? null;
      // period-scoped id so future renewals can grant again
      const g = await tryGrant(
        `${opts.subscriptionId}:${d.current_period_start ?? d.created_at ?? "init"}`,
        productId, d.status ?? "ACTIVE", d.customer?.email ?? "", "direct-subscription"
      );
      if (g) return { granted: g, reason: isTestBilling() ? "test-mode" : "granted", email, testMode: isTestBilling(), detail: opts.subscriptionId };
    }
  }

  // 2) list fallback
  const list = await dodoGet("/payments?limit=50");
  if (!list.ok) diag.push(`GET /payments -> ${list.status}`);
  else {
    const arr = Array.isArray(list.data) ? list.data : (list.data?.payments ?? list.data?.data ?? list.data?.results ?? []);
    for (const p of arr) {
      const g = await tryGrant(
        p.payment_id ?? p.id,
        p.product_id ?? p.product_cart?.[0]?.product_id ?? null,
        p.status ?? "", p.customer?.email ?? p.customer_email ?? "", "list"
      );
      if (g) return { granted: g, reason: isTestBilling() ? "test-mode" : "granted", email, testMode: isTestBilling(), detail: String(p.payment_id ?? p.id) };
    }
    diag.push(`list:${Array.isArray(arr) ? arr.length : 0}-payments-no-match`);
  }

  return {
    granted: null,
    reason: email.length > 0 && !emailTrusted ? "unverified-email" : "no-match",
    email,
    detail: diag.join(" | ") || "no matching payment found",
  };
}