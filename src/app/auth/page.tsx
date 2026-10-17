"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Inbox, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";

type Mode = "signin" | "signup";

const errors: Record<string, string> = {
  google_not_configured: "Google sign-in is not configured yet. Please contact the workspace administrator.",
  google_consent_cancelled: "Google sign-in was cancelled. You can try again whenever you're ready.",
  invalid_oauth_state: "Your sign-in session expired or could not be verified. Please try again.",
  google_connection_failed: "We couldn't complete Google sign-in. Please try again.",
  account_not_found: "No account exists for that Google account yet. Choose Create account to get started.",
  account_exists: "An account already exists for that Google account. Choose Sign in instead."
};

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryError = params.get("error");
    setError(queryError);
    setLoggedOut(params.get("loggedOut") === "1");
    if (queryError === "account_not_found") setMode("signup");
    if (queryError === "account_exists") setMode("signin");
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(response => response.json())
      .then(data => {
        if (!cancelled && data.user) window.location.replace("/");
      })
      .catch(() => undefined)
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  function continueWithGoogle(nextMode: Mode) {
    setBusy(true);
    window.location.assign("/api/auth/google/start?intent=" + nextMode);
  }

  return (
    <main className="auth-page">
      <section className="auth-visual" aria-label="Assistant workspace introduction">
        <a href="/auth" className="auth-brand"><span className="auth-brand-mark"><Sparkles size={20}/></span><span>assistant<span className="workspace-brand-dot">.</span></span></a>
        <div className="auth-visual-copy">
          <span className="auth-eyebrow"><span className="status-dot"/> YOUR WORKDAY, IN FOCUS</span>
          <h1>Make room for the work that matters.</h1>
          <p>One calm workspace for your priorities, meetings, follow-ups, and next best actions.</p>
          <div className="auth-feature-list">
            <div><span><CheckCircle2 size={17}/></span><div><strong>Know what needs attention</strong><small>Start with a prioritized daily briefing.</small></div></div>
            <div><span><CalendarDays size={17}/></span><div><strong>Bring your day together</strong><small>See tasks and calendar context in one place.</small></div></div>
            <div><span><ShieldCheck size={17}/></span><div><strong>You stay in control</strong><small>Read-only Google access. No email is sent for you.</small></div></div>
          </div>
        </div>
        <div className="auth-visual-footer"><span>PERSONAL EXECUTIVE WORKSPACE</span><span>Thoughtful by design.</span></div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><span className="auth-brand-mark"><Sparkles size={19}/></span><strong>assistant<span className="workspace-brand-dot">.</span></strong></div>
        <div className="auth-card">
          <div className="auth-card-kicker"><span className="auth-card-icon"><ShieldCheck size={16}/></span> SECURE ACCESS</div>
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="auth-subtitle">{mode === "signin" ? "Sign in to pick up where your workday left off." : "Set up your personal workspace in a few simple steps."}</p>
          <div className="auth-mode-switch" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => setMode("signin")}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
          </div>
          {error && <div role="alert" className="auth-alert"><span>!</span><p>{errors[error] ?? "Something went wrong. Please try again."}</p></div>}
          {loggedOut && <div role="status" className="auth-success"><CheckCircle2 size={16}/><span>You have been signed out securely.</span></div>}
          <button type="button" className="auth-google-button" onClick={() => continueWithGoogle(mode)} disabled={busy || checking}>
            {busy || checking ? <LoaderCircle size={18} className="animate-spin"/> : <GoogleMark/>}
            <span>{busy ? "Redirecting to Google…" : mode === "signin" ? "Continue with Google" : "Create account with Google"}</span>
            {!busy && !checking && <ArrowRight size={16} className="auth-button-arrow"/>}
          </button>
          <div className="auth-divider"><span/> <small>SECURE GOOGLE AUTHENTICATION</small> <span/></div>
          <div className="auth-trust-note"><ShieldCheck size={17}/><p>Your Google account verifies your identity. Mail and calendar access is a separate permission, requested only when you connect Google Workspace.</p></div>
          <p className="auth-terms">By continuing, you agree to use this workspace responsibly. Your account is tied to your verified Google email.</p>
          <div className="auth-switch-copy">{mode === "signin" ? "New to Assistant?" : "Already have an account?"} <button type="button" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create an account" : "Sign in instead"}</button></div>
        </div>
        <div className="auth-panel-footer"><span><Clock3 size={13}/> A clearer start to your day</span><span>Privacy-first access</span></div>
      </section>
    </main>
  );
}

function GoogleMark() {
  return <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2 13.22l7.98 6.19C11.88 13.72 17.48 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.98 46.98 31.86 46.98 24.55z"/><path fill="#FBBC05" d="M9.98 28.59A14.4 14.4 0 0 1 9.2 24c0-1.6.28-3.15.78-4.59L2 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.42-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.18 2.3-6.52 0-12.12-4.22-14.02-10.09L2 34.78C6.51 42.62 14.62 48 24 48z"/></svg>;
}
