import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { resolveVertexConfig, resolveServiceAccount } from "@/providers/vertex-provider";
import { applyPurchaseRule } from "@/app/actions/billing";
import { ensureUser, adminDb } from "@/store/credits-store";

const APP_NAME = "worldsmith-credits-v2";

/** Reuses the shared admin app (same name as credits-store) for Auth lookups only. */
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

const REPLAY_TOLERANCE_SECONDS = 300;

/**
 * Dodo Payments follows the Standard Webhooks spec: sign `${webhook-id}.${webhook-timestamp}.${body}`
 * with HMAC-SHA256, base64-encoded. The dashboard secret may or may not carry the `whsec_` prefix
 * convention (base64 key after the prefix) — support both so this works regardless of exactly how
 * the configured secret is formatted.
 */
function verifyDodoSignature(secret: string, id: string, timestamp: string, body: string, sigHeader: string): boolean {
  if (!id || !timestamp || !sigHeader) return false;
  const tsNum = parseInt(timestamp, 10);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > REPLAY_TOLERANCE_SECONDS) return false;

  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
  const signedContent = `${id}.${timestamp}.${body}`;
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected);

  // header may carry multiple space-separated "v1,<sig>" entries (secret rotation)
  return sigHeader.split(/\s+/).some((entry) => {
    const candidate = entry.includes(",") ? entry.split(",")[1] : entry;
    try {
      const candidateBuf = Buffer.from(candidate);
      return candidateBuf.length === expectedBuf.length && crypto.timingSafeEqual(candidateBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const webhookId = req.headers.get("webhook-id") ?? "";
  const timestamp = req.headers.get("webhook-timestamp") ?? "";
  const sigHeader = req.headers.get("webhook-signature") ?? req.headers.get("dodo-signature") ?? "";
  const body = await req.text();

  if (secret) {
    if (!verifyDodoSignature(secret, webhookId, timestamp, body, sigHeader)) {
      console.error("[BILLING] webhook signature verification failed");
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  } else {
    // No secret configured — can't verify. Log loudly rather than silently trusting every request.
    console.warn("[BILLING] DODO_WEBHOOK_SECRET is not set — webhook signatures are NOT being verified.");
  }

  try {
    const event = JSON.parse(body);
    const d = event?.data ?? event;
    const productId = d?.product_id ?? event?.product_id ?? d?.payment_link_id;
    // Prefer ids Dodo itself guarantees are stable (payment id, or the Standard Webhooks event id)
    // over anything involving Date.now(), which would defeat dedup on retries.
    const paymentId =
      d?.payment_id ?? d?.id ?? webhookId ?? `${productId}_${d?.created_at ?? d?.customer?.email ?? "evt"}`;
    const email = d?.customer?.email ?? d?.customer_email ?? d?.email ?? "";

    const map: Record<string, any> = JSON.parse(process.env.DODO_PRODUCT_MAP ?? "{}");
    let rule = map[productId];
    if (!rule) {
      const md = d?.product?.metadata ?? d?.metadata ?? {};
      if (md.ws_pack) rule = { type: "pack", pack: md.ws_pack };
      else if (md.ws_plan) rule = { type: "plan", plan: md.ws_plan, cycle: md.ws_cycle };
    }

    const type = event?.type ?? event?.event ?? "";
    const isCancelish = /cancel|refund|charge.?back|expired|failed/i.test(type);
    const isSuccessish = /succeed|success|paid|completed|active/i.test(type);

    const db = adminDb();

    // uid from checkout-session metadata first — we pass user_uid at checkout, so this covers
    // every purchase started from the site and needs no further proof of identity.
    let uid: string | null = d?.metadata?.user_uid ?? event?.metadata?.user_uid ?? null;
    // Fallback for payments made outside our checkout (a raw payment link): match on the payer's
    // email, but only to an account that has *verified* that address. Firebase lets anyone sign up
    // with an address they don't own, so an unverified match would hand a stranger's purchase to
    // them. Without a verified match the payment is filed as unclaimed and the buyer reconciles it
    // from the pricing page once they verify.
    if (!uid && email) {
      try {
        const rec = await getAuth(adminApp()).getUserByEmail(email);
        if (rec.emailVerified) uid = rec.uid;
      } catch {}
    }

    // Cancellations/refunds/chargebacks: stop treating the subscription as active. We don't claw
    // back already-spent credits automatically, but we do stop silently ignoring these events.
    if (isCancelish) {
      if (uid) {
        await ensureUser(uid, email);
        await db.collection("users").doc(uid).set({ subActive: false, subCancelledAt: Date.now() }, { merge: true });
      }
      return NextResponse.json({ ok: true, handled: "cancellation" });
    }

    if (!rule) return NextResponse.json({ ok: true, ignored: true });
    if (type && !isSuccessish) return NextResponse.json({ ok: true, ignored: true });

    // Idempotency guard: only the transaction that actually creates the payments/{paymentId} doc
    // may grant credits. Provider retries of the same event (common on timeout/5xx) then no-op.
    const ref = db.collection("payments").doc(String(paymentId));
    let won = false;
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) { won = false; return; }
      tx.set(ref, { productId, email, rule, status: uid ? "claimed" : "unclaimed", uid: uid ?? null, at: Date.now() });
      won = true;
    });

    if (won && uid) {
      await ensureUser(uid, email);
      // Dodo's own next-billing date when the event carries one, so the renewal shown to the
      // subscriber matches what they will actually be charged on rather than our arithmetic.
      // Field naming varies by event shape, so try the plausible ones and fall back to computing.
      const providerRenews = [
        d?.next_billing_date, d?.next_billing_at, d?.current_period_end, d?.subscription?.next_billing_date,
      ].map((v) => (typeof v === "number" ? (v > 1e12 ? v : v * 1000) : v ? Date.parse(String(v)) : NaN))
       .find((n) => Number.isFinite(n) && n > Date.now());
      await applyPurchaseRule(uid, rule, providerRenews);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[BILLING] webhook processing error:", e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
