"use client";

import type { Session } from "@supabase/supabase-js";
import Image from "next/image";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  buildCloudExportPayload,
  CloudSnapshotConflictError,
  hashCloudPayload,
  loadCloudSnapshot,
  saveCloudSnapshot,
  type CloudSnapshot,
} from "@/lib/supabase/cloudSnapshots";
import { applyCloudPayloadToLocal, initializeEmptyLocalProfile } from "@/services/cloudLocalBridge";
import { DATA_CHANGED_EVENT } from "@/utils/events";
import { clearLocalFinanceData } from "@/utils/localFinanceData";

type GateState = "checking" | "signed-out" | "loading-data" | "ready" | "error";
type AuthMode = "sign-in" | "create";
type CloudRuntimeState = "checking" | "saved" | "saving" | "pending" | "cloud-newer" | "conflict" | "offline" | "error";
type AuthSessionValue = {
  email: string;
  hasGoogleIdentity: boolean;
  linkGoogleIdentity: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionValue | null>(null);

export function useAuthSession() {
  const value = useContext(AuthSessionContext);
  if (!value) throw new Error("useAuthSession must be used inside AuthGate.");
  return value;
}

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/email not confirmed/i.test(message)) return "Confirm your email before signing in.";
  if (/failed to fetch/i.test(message)) return "FinanceOS could not reach the authentication service.";
  return message;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [cloudState, setCloudState] = useState<CloudRuntimeState>("checking");
  const [cloudMessage, setCloudMessage] = useState("Checking cloud state");
  const [idleWarning, setIdleWarning] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const initializingUser = useRef<string | null>(null);
  const observedSnapshot = useRef<CloudSnapshot | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const initializeSession = useCallback(async (nextSession: Session) => {
    if (initializingUser.current === nextSession.user.id) return;
    initializingUser.current = nextSession.user.id;
    setSession(nextSession);
    setState("loading-data");
    setMessage(null);
    try {
      const snapshot = await loadCloudSnapshot();
      if (snapshot) applyCloudPayloadToLocal(snapshot.payload);
      else initializeEmptyLocalProfile();
      observedSnapshot.current = snapshot;
      setCloudState(snapshot ? "saved" : "pending");
      setCloudMessage(snapshot ? `Saved as revision ${snapshot.revision}` : "No cloud data yet");
      setState("ready");
    } catch (error) {
      initializingUser.current = null;
      setMessage(friendlyAuthError(error));
      setState("error");
    }
  }, []);

  const saveLocalChanges = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    if (!dirty.current) return true;
    if (!navigator.onLine) {
      setCloudState("offline");
      setCloudMessage("Offline - changes are pending");
      return false;
    }

    saving.current = true;
    dirty.current = false;
    setCloudState("saving");
    setCloudMessage("Saving changes");
    try {
      const saved = await saveCloudSnapshot({
        expectedRevision: observedSnapshot.current?.revision ?? 0,
        label: "Automatic save",
      });
      observedSnapshot.current = saved;
      setCloudState("saved");
      setCloudMessage(`Saved as revision ${saved.revision}`);
      return true;
    } catch (error) {
      dirty.current = true;
      if (error instanceof CloudSnapshotConflictError) {
        setCloudState("conflict");
        setCloudMessage("Cloud changed elsewhere - review required");
      } else if (!navigator.onLine || /failed to fetch/i.test(String(error))) {
        setCloudState("offline");
        setCloudMessage("Offline - changes are pending");
      } else {
        setCloudState("error");
        setCloudMessage("Save failed - retry");
      }
      return false;
    } finally {
      saving.current = false;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setCloudState("pending");
    setCloudMessage("Changes pending");
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveLocalChanges(), 1_500);
  }, [saveLocalChanges]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setMessage("Supabase authentication is not configured for this FinanceOS build.");
      setState("error");
      return;
    }
    const supabase = getSupabaseBrowserClient();
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setMessage(friendlyAuthError(error));
        setState("error");
      } else if (data.session) {
        void initializeSession(data.session);
      } else {
        setState("signed-out");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      if (nextSession) void initializeSession(nextSession);
      else {
        initializingUser.current = null;
        setSession(null);
        setState("signed-out");
      }
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [initializeSession]);

  useEffect(() => {
    if (state !== "ready" || !session) return;

    const handleDataChanged = (event: Event) => {
      const domain = (event as CustomEvent<{ domain?: string }>).detail?.domain;
      if (domain === "cloud-bootstrap" || domain === "cloud-empty-profile") return;
      scheduleSave();
    };
    const checkCloudRevision = async () => {
      if (!navigator.onLine || saving.current) return;
      try {
        const latest = await loadCloudSnapshot();
        const observed = observedSnapshot.current;
        if (!latest || !observed || latest.revision <= observed.revision) return;
        const localHash = await hashCloudPayload(buildCloudExportPayload());
        const localChanged = localHash !== observed.payload_hash;
        setCloudState(localChanged ? "conflict" : "cloud-newer");
        setCloudMessage(localChanged
          ? "Local and cloud data both changed"
          : "Newer cloud data is available");
      } catch {
        if (!navigator.onLine) {
          setCloudState("offline");
          setCloudMessage("Offline");
        }
      }
    };
    const handleOnline = () => {
      if (dirty.current) scheduleSave();
      else void checkCloudRevision();
    };
    const handleFocus = () => void checkCloudRevision();
    const interval = window.setInterval(checkCloudRevision, 30_000);

    window.addEventListener(DATA_CHANGED_EVENT, handleDataChanged);
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, handleDataChanged);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(interval);
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [scheduleSave, session, state]);

  const signOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError(null);
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    dirty.current = true;
    const saved = await saveLocalChanges();
    if (!saved) {
      setSignOutError("FinanceOS could not complete the final cloud save. You remain signed in so no local work is discarded.");
      setSigningOut(false);
      return;
    }

    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) throw error;
      clearLocalFinanceData();
      observedSnapshot.current = null;
      dirty.current = false;
    } catch (error) {
      setSignOutError(friendlyAuthError(error));
    } finally {
      setSigningOut(false);
    }
  }, [saveLocalChanges, signingOut]);

  const linkGoogleIdentity = useCallback(async () => {
    setAccountMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.linkIdentity({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      setAccountMessage(`Google identity linking failed: ${friendlyAuthError(error)}`);
    }
  }, []);

  useEffect(() => {
    if (state !== "ready" || !session) return;
    let warningTimer: number;
    let logoutTimer: number;

    const resetIdleClock = () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(logoutTimer);
      setIdleWarning(false);
      warningTimer = window.setTimeout(() => setIdleWarning(true), 14 * 60 * 1_000);
      logoutTimer = window.setTimeout(() => void signOut(), 15 * 60 * 1_000);
    };
    const activityEvents: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetIdleClock, { passive: true }));
    resetIdleClock();
    return () => {
      window.clearTimeout(warningTimer);
      window.clearTimeout(logoutTimer);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetIdleClock));
    };
  }, [session, signOut, state]);

  async function submitEmailAuth(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const result = mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
      if (result.error) throw result.error;
      if (mode === "create" && !result.data.session) {
        setMessage("Account created. Check your email to confirm it, then sign in.");
        setMode("sign-in");
      }
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  async function continueWithGoogle() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
    } catch (error) {
      setMessage(friendlyAuthError(error));
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!email.trim()) {
      setMessage("Enter your email first.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setMessage("Password recovery email sent.");
    } catch (error) {
      setMessage(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  }

  if (state === "ready" && session) {
    const tone = cloudState === "saved" ? "saved"
      : cloudState === "conflict" || cloudState === "cloud-newer" || cloudState === "error" ? "attention"
        : "working";
    return (
      <AuthSessionContext.Provider value={{
        email: session.user.email ?? "Signed-in user",
        hasGoogleIdentity: Boolean(session.user.identities?.some((identity) => identity.provider === "google")),
        linkGoogleIdentity,
        signOut,
      }}>
        {children}
        <button
          type="button"
          className={`finance-cloud-status finance-cloud-status-${tone}`}
          onClick={() => {
            if (cloudState === "cloud-newer") {
              window.location.reload();
            } else if (cloudState === "pending" || cloudState === "offline" || cloudState === "error") {
              scheduleSave();
            }
          }}
          title={cloudState === "cloud-newer"
            ? "Reload the newer cloud revision"
            : cloudState === "conflict"
              ? "Open Import / Export to review the conflict without overwriting either copy"
              : cloudState === "pending" || cloudState === "offline" || cloudState === "error"
                ? "Retry cloud save"
                : "Cloud save status"}
        >
          <span aria-hidden="true" />
          {cloudMessage}
        </button>
        {idleWarning && (
          <div className="finance-session-overlay" role="dialog" aria-modal="true" aria-labelledby="idle-warning-title">
            <div className="finance-session-dialog">
              <h2 id="idle-warning-title">Still working?</h2>
              <p>For your security, FinanceOS will save and sign out after 15 minutes of inactivity.</p>
              <button type="button" className="finance-button finance-auth-primary" onClick={() => setIdleWarning(false)}>
                Continue Session
              </button>
            </div>
          </div>
        )}
        {signOutError && (
          <div className="finance-session-overlay" role="dialog" aria-modal="true" aria-labelledby="signout-error-title">
            <div className="finance-session-dialog">
              <h2 id="signout-error-title">Cloud save needs attention</h2>
              <p>{signOutError}</p>
              <div className="finance-session-actions">
                <button type="button" className="finance-button finance-auth-primary" onClick={() => void signOut()}>
                  Retry Save &amp; Sign Out
                </button>
                <button type="button" className="finance-button" onClick={() => setSignOutError(null)}>Stay Signed In</button>
              </div>
            </div>
          </div>
        )}
        {accountMessage && (
          <div className="finance-session-overlay" role="dialog" aria-modal="true" aria-labelledby="account-message-title">
            <div className="finance-session-dialog">
              <h2 id="account-message-title">Account connection</h2>
              <p>{accountMessage}</p>
              <button type="button" className="finance-button finance-auth-primary" onClick={() => setAccountMessage(null)}>Close</button>
            </div>
          </div>
        )}
        {signingOut && <div className="finance-signout-progress" role="status">Saving and signing out...</div>}
      </AuthSessionContext.Provider>
    );
  }

  const loading = state === "checking" || state === "loading-data";
  return (
    <main className="finance-auth-shell">
      <section className="finance-auth-panel" aria-live="polite">
        <div className="finance-auth-brand">
          <Image src="/financeos-icon.svg" alt="" width={48} height={48} priority />
          <div>
            <h1>FinanceOS</h1>
            <p>Secure personal and business finance operations.</p>
          </div>
        </div>

        {loading ? (
          <div className="finance-auth-loading">
            <span className="finance-auth-spinner" aria-hidden="true" />
            <strong>{state === "loading-data" ? "Loading your financial workspace" : "Checking your session"}</strong>
            <span>Your financial data stays hidden until this completes.</span>
          </div>
        ) : state === "error" ? (
          <div>
            <div className="finance-auth-message finance-auth-error">{message}</div>
            <button className="finance-button finance-auth-primary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        ) : (
          <>
            <button className="finance-button finance-google-button" onClick={continueWithGoogle} disabled={busy}>
              <span className="finance-google-mark">G</span>
              Continue with Google
            </button>
            <div className="finance-auth-divider"><span>or use email</span></div>
            <form onSubmit={submitEmailAuth} className="finance-auth-form">
              <label>
                Email
                <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </label>
              <label>
                Password
                <input type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
              {message && <div className="finance-auth-message">{message}</div>}
              <button type="submit" className="finance-button finance-auth-primary" disabled={busy}>
                {busy ? "Please wait..." : mode === "sign-in" ? "Sign In" : "Create Account"}
              </button>
            </form>
            <div className="finance-auth-links">
              <button type="button" onClick={() => { setMode(mode === "sign-in" ? "create" : "sign-in"); setMessage(null); }}>
                {mode === "sign-in" ? "Create an account" : "Already have an account"}
              </button>
              {mode === "sign-in" && <button type="button" onClick={resetPassword} disabled={busy}>Forgot password?</button>}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
