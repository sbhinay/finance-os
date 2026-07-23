"use client";

import type { Session } from "@supabase/supabase-js";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { loadCloudSnapshot } from "@/lib/supabase/cloudSnapshots";
import { applyCloudPayloadToLocal, initializeEmptyLocalProfile } from "@/services/cloudLocalBridge";

type GateState = "checking" | "signed-out" | "loading-data" | "ready" | "error";
type AuthMode = "sign-in" | "create";

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
  const initializingUser = useRef<string | null>(null);

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
      setState("ready");
    } catch (error) {
      initializingUser.current = null;
      setMessage(friendlyAuthError(error));
      setState("error");
    }
  }, []);

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

  if (state === "ready" && session) return <>{children}</>;

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
