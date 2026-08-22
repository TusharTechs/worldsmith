'use client';

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider, User, createUserWithEmailAndPassword, getAuth,
  onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut, updateProfile,
} from "firebase/auth";
import { serverClaimUnownedProjects } from "@/app/actions/generation";
import { useLanguage } from "@/components/LanguageProvider";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  modalOpen: boolean;
  openAuth: (mode?: "in" | "up") => void;
  closeAuth: () => void;
  requireAuth: (fn: () => void) => void;
  signInGoogle: () => Promise<void>;
  signInEmail: (mode: "in" | "up", email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateDisplayProfile: (fields: { displayName?: string; photoURL?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function firebaseApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"in" | "up">("in");

  useEffect(() => {
    const auth = getAuth(firebaseApp());
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      // On sign-in, bind any legacy ownerless projects to the configured owner account
      // (no-op for everyone else — only fires when the verified token's email matches
      // LEGACY_OWNER_EMAIL; the server derives uid/email from the token, never from client input)
      if (u) {
        u.getIdToken().then((t) => serverClaimUnownedProjects(t)).catch(() => {});
      }
    });
  }, []);

  const openAuth = useCallback((mode: "in" | "up" = "in") => { setAuthMode(mode); setModalOpen(true); }, []);
  const closeAuth = useCallback(() => setModalOpen(false), []);
  const requireAuth = useCallback((fn: () => void) => {
    if (user) fn();
    else { setAuthMode("in"); setModalOpen(true); }
  }, [user]);

  const signInGoogle = useCallback(async () => {
    const auth = getAuth(firebaseApp());
    await signInWithPopup(auth, new GoogleAuthProvider());
    setModalOpen(false);
  }, []);

  const signInEmail = useCallback(async (mode: "in" | "up", email: string, password: string) => {
    const auth = getAuth(firebaseApp());
    if (mode === "up") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    setModalOpen(false);
  }, []);

  const logout = useCallback(async () => {
    await signOut(getAuth(firebaseApp()));
  }, []);

  // Firebase mutates `currentUser` in place — updateProfile alone won't trigger a re-render,
  // so force one with a shallow clone that keeps the same prototype (methods like getIdToken intact).
  const updateDisplayProfile = useCallback(async (fields: { displayName?: string; photoURL?: string }) => {
    const auth = getAuth(firebaseApp());
    if (!auth.currentUser) return;
    await updateProfile(auth.currentUser, fields);
    const refreshed = auth.currentUser;
    setUser(Object.assign(Object.create(Object.getPrototypeOf(refreshed)), refreshed));
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, modalOpen, openAuth, closeAuth, requireAuth, signInGoogle, signInEmail, logout, updateDisplayProfile }}>
      {children}
      {modalOpen && <AuthModal initialMode={authMode} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/* ---------- Modal ---------- */

function AuthModal({ initialMode }: { initialMode: "in" | "up" }) {
  const { closeAuth, signInGoogle, signInEmail } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"in" | "up">(initialMode);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await signInEmail(mode, email, pass); }
    catch (e: any) { setErr(friendly(e.code, t)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6" onClick={closeAuth}>
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-white">
            {mode === "in" ? t("auth.welcomeBack") : t("auth.createStudio")}
          </h3>
          <button onClick={closeAuth} className="text-zinc-500 hover:text-zinc-300 text-xs">✕</button>
        </div>
        <p className="text-xs text-zinc-500">
          {t("auth.modalSubtitle")}
        </p>

        <button
          onClick={() => { setBusy(true); setErr(null); signInGoogle().catch((e) => { setErr(friendly(e?.code, t)); setBusy(false); }); }}
          disabled={busy}
          className="w-full py-3 bg-white text-black text-xs font-semibold uppercase tracking-widest rounded hover:bg-zinc-200 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <GoogleG /> {t("auth.continueGoogle")}
        </button>

        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-600 uppercase">
          <span className="flex-1 h-px bg-zinc-800" />{t("auth.or")}<span className="flex-1 h-px bg-zinc-800" />
        </div>

        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={t("auth.emailPlaceholder")}
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-sm focus:outline-none focus:border-cyan-700" />
        <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" placeholder={t("auth.passwordPlaceholder")}
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-sm focus:outline-none focus:border-cyan-700"
          onKeyDown={(e) => e.key === "Enter" && submit()} />

        {err && <p className="text-red-400 text-xs font-mono">{err}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full py-3 bg-cyan-500 text-black text-xs font-semibold uppercase tracking-widest rounded hover:bg-cyan-400 disabled:opacity-50">
          {busy ? t("auth.oneMoment") : mode === "in" ? t("auth.signIn") : t("auth.createAccount")}
        </button>

        <p className="text-center text-xs text-zinc-500">
          {mode === "in" ? t("auth.newHere") : t("auth.alreadyHaveAccount")}{" "}
          <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }} className="text-cyan-400 hover:text-cyan-300">
            {mode === "in" ? t("auth.createAccountLink") : t("auth.signIn")}
          </button>
        </p>
      </div>
    </div>
  );
}

function friendly(code: string | undefined, t: (path: string) => string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return t("auth.errors.wrongPassword");
    case "auth/email-already-in-use": return t("auth.errors.emailInUse");
    case "auth/weak-password": return t("auth.errors.weakPassword");
    case "auth/invalid-email": return t("auth.errors.invalidEmail");
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request": return t("auth.errors.popupClosed");
    case "auth/unauthorized-domain": return t("auth.errors.unauthorizedDomain");
    case "auth/operation-not-allowed": return t("auth.errors.operationNotAllowed");
    default: return t("auth.errors.generic");
  }
}

function GoogleG() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5.1 3.7-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-6-2.1-6.9-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.8-2.9z" />
      <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.8 2.9c.9-3 3.7-5 6.9-5z" />
    </svg>
  );
}