import { NextResponse } from "next/server";
import { resolveServiceAccount, resolveVertexConfig } from "@/providers/vertex-provider";

export const dynamic = "force-dynamic";

/**
 * Deployment self-check.
 *
 * A missing server-side environment variable presents identically to a code bug: every route that
 * touches Firebase Admin returns a blank 500 and the browser shows a minified React error with the
 * detail stripped. This reports which variables actually arrived and whether credentials resolve,
 * so a deployment problem can be told apart from a code problem without reading platform logs.
 *
 * Deliberately reports presence and length only — never a value. The variable names are already
 * public in .env.example, so this discloses nothing that the repository does not.
 */
export async function GET() {
  const present = (name: string) => {
    const v = process.env[name];
    return v ? { set: true, length: v.length } : { set: false };
  };

  let admin: { ok: boolean; error?: string; clientEmailDomain?: string };
  try {
    const sa = resolveServiceAccount();
    const email = String(sa.client_email ?? "");
    admin = {
      ok: Boolean(sa.private_key && sa.client_email),
      // Domain only — enough to confirm the right project, without exposing the account address.
      clientEmailDomain: email.includes("@") ? email.split("@")[1] : undefined,
    };
  } catch (e) {
    admin = { ok: false, error: (e as Error).message };
  }

  return NextResponse.json({
    ok: admin.ok,
    admin,
    vertexProject: resolveVertexConfig().projectId ? "set" : "MISSING",
    env: {
      VERTEX_SERVICE_ACCOUNT_JSON: present("VERTEX_SERVICE_ACCOUNT_JSON"),
      FIREBASE_SERVICE_ACCOUNT_JSON: present("FIREBASE_SERVICE_ACCOUNT_JSON"),
      VERTEX_SERVICE_ACCOUNT_PATH: present("VERTEX_SERVICE_ACCOUNT_PATH"),
      VERTEX_PROJECT_ID: present("VERTEX_PROJECT_ID"),
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "MISSING",
      PARALLEL_API_KEY: present("PARALLEL_API_KEY"),
      DODO_WEBHOOK_SECRET: present("DODO_WEBHOOK_SECRET"),
      RESEARCH_PROVIDER: process.env.RESEARCH_PROVIDER ?? "unset",
      IMAGE_PROVIDER: process.env.IMAGE_PROVIDER ?? "unset",
    },
  });
}
