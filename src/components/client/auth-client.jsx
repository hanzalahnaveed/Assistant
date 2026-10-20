"use client";

import { Alert, Button, Input } from "antd";
import { useEffect, useState } from "react";

const googleErrors = {
  google_not_configured: "Google sign-in is not configured yet. Use email and password instead.",
  google_consent_cancelled: "Google sign-in was cancelled. You can try again whenever you're ready.",
  invalid_oauth_state: "The Google sign-in request expired or could not be verified. Please try again.",
  account_not_found: "No account exists for this Google account yet. Create an account first.",
  account_exists: "An account with this Google email already exists. Please sign in instead.",
  google_connection_failed: "Google sign-in could not be completed. Please try again.",
  sign_in_required: "Please sign in before connecting Google Workspace.",
};

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (code) setError(googleErrors[code] || "Google sign-in could not be completed. Please try again.");
  }, []);

  function changeMode(nextMode) {
    setMode(nextMode);
    setError("");
    setSuccess("");
  }

  async function submitCredentials(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          response.ok
            ? "The server returned an unexpected response. Please try again."
            : `The server could not complete the request (HTTP ${response.status}). Check the server logs.`,
        );
      }

      if (!response.ok) {
        setError(data?.message || ({
          account_exists: "An account with this email already exists. Please sign in.",
          invalid_credentials: "Email or password is incorrect.",
          server_misconfigured: "Authentication is not configured on the server. Set AUTH_SECRET to a random value of at least 32 characters and redeploy.",
        }[data?.error]) || `Request failed (HTTP ${response.status}). Please try again.`);
        return;
      }

      setSuccess(mode === "signup" ? "Account created. Redirecting to your workspace…" : "Signed in successfully. Redirecting…");
      window.location.replace("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof TypeError
        ? "We couldn't reach the server. Check your connection and try again."
        : requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex h-[100vh] items-center justify-center bg-linear-to-br from-[#698cbf] to-[#4b749f] p-4">
      <section className="flex p-4 w-full max-w-md flex-col gap-4 rounded-2xl border border-white/60 bg-white/95 shadow-xl">
        <header>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[#4b749f]">Personal AI Assistant</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[#17212b]">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#586575]">
            {mode === "signin" ? "Sign in to continue to your workspace." : "Set up your account to get started."}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-1 rounded-xl border-2 border-[#4B749F] bg-[#f5f7fa] p-1" role="tablist" aria-label="Account access">
          <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => changeMode("signin")}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium transition ${mode === "signin" ? "bg-white text-[#234e78] shadow-sm" : "text-[#657487] hover:text-[#234e78]"}`}>
            Sign in
          </button>
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => changeMode("signup")}
            className={`min-h-11 rounded-lg px-3 text-sm font-medium transition ${mode === "signup" ? "bg-white text-[#234e78] shadow-sm" : "text-[#657487] hover:text-[#234e78]"}`}>
            Create account
          </button>
        </div>

        {error && <Alert type="error" showIcon message="Unable to continue" description={error} role="alert" />}
        {success && <Alert type="success" showIcon message={success} role="status" />}

        <form className="flex flex-col gap-2" onSubmit={submitCredentials} noValidate={false}>
          {mode === "signup" && (
            <label className="flex flex-col gap-2 text-sm font-medium text-[#273444]">
              Your name
              <Input autoComplete="name" name="name" type="text" maxLength={80} value={name}
                onChange={(event) => setName(event.target.value)} placeholder="How should we address you?" size="large" />
            </label>
          )}
          <label className="flex flex-col gap-2 text-sm font-medium text-[#273444]">
            Email address
            <Input autoComplete="email" name="email" type="email" required maxLength={254} value={email}
              onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" size="large" />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-[#273444]">
            Password
            <Input autoComplete={mode === "signup" ? "new-password" : "current-password"} name="password"
              type="password" required minLength={mode === "signup" ? 8 : 1} maxLength={128} value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} size="large" />
          </label>
          {mode === "signup" && <p className="text-xs leading-5 text-[#687789]">Use at least 8 characters. Your password is stored as a secure hash.</p>}
          <Button htmlType="submit" type="primary" size="large" block loading={busy} disabled={busy}
            className="mt-2 h-12 rounded-xl font-semibold">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in with email" : "Create account"}
          </Button>
        </form>
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-[#e3e8ee]" />
          <span className="text-xs text-[#8793a1]">or</span>
          <span className="h-px flex-1 bg-[#e3e8ee]" />
        </div>
        <Button
          htmlType="button"
          size="large"
          block
          disabled={busy}
          onClick={() => {
            setError("");
            window.location.assign(`/api/auth/google/start?intent=${mode}`);
          }}
          className="h-12 rounded-xl border-[#d8e0e8] font-semibold text-[#273444]"
        >
          Continue with Google
        </Button>
      </section>
    </main>
  );
}
