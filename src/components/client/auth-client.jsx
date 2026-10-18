"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
const queryErrors = {
  google_not_configured:
    "Google sign-in is not configured. Use your email and password, or configure Google Workspace later.",
  google_consent_cancelled:
    "Google sign-in was cancelled. You can try again whenever you're ready.",
  invalid_oauth_state: "Your sign-in session expired or could not be verified. Please try again.",
  google_connection_failed: "We couldn't complete Google sign-in. Please try again.",
  account_not_found:
    "No account exists for that Google account yet. Choose Create account to get started.",
  account_exists: "An account already exists for that Google account. Choose Sign in instead.",
};
export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [loggedOut, setLoggedOut] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryError = params.get("error");
    setError(
      queryError ? (queryErrors[queryError] ?? "Something went wrong. Please try again.") : null,
    );
    setLoggedOut(params.get("loggedOut") === "1");
    if (queryError === "account_not_found") setMode("signup");
    if (queryError === "account_exists") setMode("signin");
    let cancelled = false;
    fetch("/api/auth/session", {
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled && data.user) window.location.replace("/");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  async function submitCredentials(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const responseText = await response.text();
      let data = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        if (!response.ok) {
          setError(
            "The server returned an unexpected response (HTTP " +
              response.status +
              "). Check the terminal running Next.js for the underlying error.",
          );
          return;
        }
        throw new Error("The server returned an invalid response.");
      }
      if (!response.ok) {
        setError(
          data.message ??
            (data.error === "account_exists"
              ? "An account with this email already exists. Please sign in."
              : "The request failed (HTTP " +
                response.status +
                "). Check the server logs if this continues."),
        );
        return;
      }
      window.location.assign("/");
    } catch (error) {
      if (error instanceof TypeError) {
        setError(
          "We couldn't reach the server. Check that the app is running at this address and try again.",
        );
      } else {
        setError(
          error instanceof Error
            ? error.message
            : "The server returned an invalid response. Check the Next.js terminal logs.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  function continueWithGoogle() {
    setBusy(true);
    window.location.assign("/api/auth/google/start?intent=" + mode);
  }
  return (
    <main className="flex flex-col items-center justify-center">
      <div className="mb-[clamp(38px,9vh,72px)] hidden w-full max-w-[410px] items-center gap-2.5 text-[17px] tracking-[-0.6px] max-[700px]:flex">
        <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-[#d8efe0] text-[#174c39]">
          <Sparkles size={19} />
        </span>
        <strong>
          assistant<span className="text-[#dce9d1]">.</span>
        </strong>
      </div>
      <div className="w-full max-w-[410px] max-[700px]:rounded-[20px] max-[700px]:border max-[700px]:border-[#e7ece7] max-[700px]:bg-white max-[700px]:px-[22px] max-[700px]:pt-[27px] max-[700px]:pb-6 max-[700px]:shadow-[0_9px_32px_rgb(25_48_36/4%)] max-[370px]:px-4">
        <h2 className="m-0 text-[clamp(2rem,3vw,2.5rem)] leading-[1.16] font-[650] tracking-[-0.06em]">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h2>
        <p className="mt-3 mb-[27px] text-[13px] leading-[1.75] text-[#738078] text-pretty">
          {mode === "signin"
            ? "Sign in to pick up where your workday left off."
            : "Set up your personal workspace with your email."}
        </p>
        <div
          className="mb-[22px] grid grid-cols-2 gap-1 rounded-xl border border-[#e8ece8] bg-[#f6f8f5] p-1"
          role="tablist"
          aria-label="Account access"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`min-h-[39px] rounded-[9px] border-0 text-xs! font-[650]! ${mode === "signin" ? "bg-white text-[#164e3b] shadow-[0_1px_4px_rgb(22_43_30/10%)]" : "bg-transparent text-[#738078]"}`}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`min-h-[39px] rounded-[9px] border-0 text-xs! font-[650]! ${mode === "signup" ? "bg-white text-[#164e3b] shadow-[0_1px_4px_rgb(22_43_30/10%)]" : "bg-transparent text-[#738078]"}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="mb-[17px] flex items-start gap-2.5 rounded-[13px] border border-[#f0d8d2] bg-[#fff7f5] p-3 text-[11px] leading-[1.65] text-[#8b4134]"
          >
            <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#b65b49] font-[750] text-white">
              !
            </span>
            <p className="m-0 text-pretty">{error}</p>
          </div>
        )}
        {loggedOut && (
          <div
            role="status"
            className="mb-[17px] flex items-center gap-2.5 rounded-[13px] border border-[#d6e9db] bg-[#f3faf5] p-3 text-[11px] leading-[1.65] text-[#276447]"
          >
            <CheckCircle2 size={16} />
            <span>You have been signed out securely.</span>
          </div>
        )}
        <form className="mt-[3px] flex flex-col gap-3.5" onSubmit={submitCredentials}>
          {mode === "signup" && (
            <label className="flex flex-col gap-[7px] text-[11px] font-bold text-[#46564b]">
              <span>Your name</span>
              <input
                className="min-h-[43px] w-full rounded-[11px] border border-[#dce4dc] bg-white px-[13px] py-[11px] font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
                autoComplete="name"
                name="name"
                type="text"
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="How should we address you?"
              />
            </label>
          )}
          <label className="flex flex-col gap-[7px] text-[11px] font-bold text-[#46564b]">
            <span>Email address</span>
            <input
              className="min-h-[43px] w-full rounded-[11px] border border-[#dce4dc] bg-white px-[13px] py-[11px] font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
              autoComplete="email"
              name="email"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label className="flex flex-col gap-[7px] text-[11px] font-bold text-[#46564b]">
            <span>Password</span>
            <input
              className="min-h-[43px] w-full rounded-[11px] border border-[#dce4dc] bg-white px-[13px] py-[11px] font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              name="password"
              type="password"
              required
              minLength={mode === "signup" ? 8 : 1}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
            />
          </label>
          {mode === "signup" && (
            <p className="-mt-[5px] mb-0 text-[10px] leading-normal text-[#89958c] text-pretty">
              Use at least 8 characters. Your password is stored as a secure hash.
            </p>
          )}
          <button
            type="submit"
            className="mt-[3px] flex min-h-[51px] w-full items-center justify-center gap-3 rounded-xl border px-[15px] py-3 text-xs! font-[680]! shadow-[0_2px_5px_rgb(22_43_30/3%)] enabled:hover:shadow-[0_5px_14px_rgb(22_43_30/6%)] border-[#7ba05b] bg-[#7ba05b] text-white disabled:bg-[#f8faf8] disabled:text-[#839087] enabled:hover:border-[#5d7d43] enabled:hover:bg-[#5d7d43]"
            disabled={busy || checking}
          >
            {busy || checking ? (
              <LoaderCircle size={18} className="animate-[spin_0.9s_linear_infinite]" />
            ) : (
              <span className="grid h-5 w-5 place-items-center text-white">
                <ShieldCheck size={17} />
              </span>
            )}
            <span>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in with email" : "Create account"}
            </span>
            {!busy && !checking && <ArrowRight size={16} className="ml-auto text-white" />}
          </button>
        </form>
        <div className="mt-[21px] mb-[15px] flex items-center gap-3 text-[#9aa49c]">
          <span className="h-px flex-1 bg-[#e9ede9]" />{" "}
          <small className="text-[8px] font-bold tracking-[1px] whitespace-nowrap">
            OR CONTINUE WITH
          </small>{" "}
          <span className="h-px flex-1 bg-[#e9ede9]" />
        </div>
        <button
          type="button"
          className="flex min-h-[51px] w-full items-center justify-center gap-3 rounded-xl border px-[15px] py-3 text-xs! font-[680]! shadow-[0_2px_5px_rgb(22_43_30/3%)] enabled:hover:shadow-[0_5px_14px_rgb(22_43_30/6%)] border-[#e1e7e1] bg-white text-[#26332b] disabled:bg-[#f8faf8] disabled:text-[#839087] enabled:hover:border-[#a9c6b2] enabled:hover:bg-[#f8faf8]"
          onClick={continueWithGoogle}
          disabled={busy || checking}
        >
          {busy || checking ? (
            <LoaderCircle size={18} className="animate-[spin_0.9s_linear_infinite]" />
          ) : (
            <GoogleMark />
          )}
          <span>{mode === "signin" ? "Continue with Google" : "Create account with Google"}</span>
          <ArrowRight size={16} className="ml-auto text-[#6f8175]" />
        </button>
        <div className="flex items-start gap-2.5 rounded-xl border border-[#e4eee5] bg-[#f4faf5] p-[13px] text-[#397055]">
          <ShieldCheck size={17} className="mt-px shrink-0" />
          <p className="m-0 text-[10px] leading-[1.75] text-[#5f7667] text-pretty">
            Google is optional for sign-in. Connect Google Workspace later if you want inbox and
            calendar context.
          </p>
        </div>
        <p className="mt-[19px] mb-0 text-center text-[10px] leading-[1.8] text-[#99a39b] text-pretty">
          Your workspace data is private to your account. Never reuse a password you use for another
          service.
        </p>
        <div className="mt-[27px] text-center text-[11px] text-[#7c887f]">
          {mode === "signin" ? "New to Assistant?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="ml-1 border-0 bg-transparent p-0.5 text-[length:inherit] font-[750]! text-[#7ba05b] hover:underline"
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
          >
            {mode === "signin" ? "Create an account" : "Sign in instead"}
          </button>
        </div>
      </div>
      <div className="mt-auto flex w-full max-w-[410px] justify-between gap-3 pt-[42px] text-[9px] text-[#9ba59d] max-[700px]:pt-[30px] max-[370px]:text-[8px]">
        <span className="inline-flex items-center gap-1.5">
          <Clock3 size={13} /> A clearer start to your day
        </span>
        <span className="inline-flex items-center gap-1.5">Privacy-first access</span>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2 13.22l7.98 6.19C11.88 13.72 17.48 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.98 46.98 31.86 46.98 24.55z"
      />
      <path
        fill="#FBBC05"
        d="M9.98 28.59A14.4 14.4 0 0 1 9.2 24c0-1.6.28-3.15.78-4.59L2 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.42-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.18 2.3-6.52 0-12.12-4.22-14.02-10.09L2 34.78C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
