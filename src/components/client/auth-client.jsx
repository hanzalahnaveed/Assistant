"use client";

import { Button, Input } from "antd";
import { useEffect, useState } from "react";

export default function AuthPage() {

  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <main className="flex justify-center items-center h-screen py-16 bg-gradient-to-br from-[#698cbf] to-[#4b749f]">
      <div className="flex flex-col justify-between w-[35%] h-full border rounded-2xl p-12 bg-white/70">
        <div className="">
          {mode === "signin" ? 
            <div className={``}>
              <p className={`font-semibold font-sans text-[32px] text-black`}>
                Welcome back
              </p>
              <p className={`text-black`}>
                Sign in to continue to your workspace.
              </p> 
            </div> :
            <p className={`text-black`}>
              Create your account
            </p>
          }
        </div>
        <div
          className="grid grid-cols-2 gap-1 rounded-xl border border-[#e8ece8] bg-[#f6f8f5] p-1"
          role="tablist"
          aria-label="Account access"
        >
          <Button
            htmlType="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`${mode === "signin" ? "bg-white text-[#164e3b] shadow-[0_1px_4px_rgb(22_43_30/10%)]" : "bg-transparent text-[#738078]"}`}
            onClick={() => {
              setMode("signin");
              setError(null);
            }}
          >
            Sign in
          </Button>
          <Button
            htmlType="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`${mode === "signup" ? "bg-white text-[#164e3b]" : "bg-transparent text-[#738078]"}`}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
          >
            Create account
          </Button>
        </div>
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-[13px] border border-[#f0d8d2] bg-[#fff7f5] p-3 text-[11px] leading-[1.65] text-[#8b4134]"
          >
            <span className="grid shrink-0 place-items-center rounded-full bg-[#b65b49] font-[750] text-white">
              !
            </span>
            <p className="m-0 text-pretty">{error}</p>
          </div>
        )}
        <form className="flex flex-col gap-10" onSubmit={submitCredentials}>
          {mode === "signup" && (
            <label className="flex flex-col gap-2 text-[14px]">
              <span>Your name</span>
              <Input
                className="h-12 w-full rounded-[11px] border border-[#E3E7ED] bg-white font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
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
          <label className="flex flex-col gap-2 text-[14px]">
            <span>Email address</span>
            <Input
              className="h-12 w-full rounded-[11px] border border-[#E3E7ED] bg-white font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
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
          <label className="flex flex-col gap-2 text-[14px]">
            <span>Password</span>
            <Input
              className="h-12 w-full rounded-[11px] border border-[#E3E7ED] bg-white font-[450]! text-[#26382d] outline-none! placeholder:text-[#a1aaa3]"
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
            <p className="mb-0 text-[10px] leading-normal text-[#89958c] text-pretty">
              Use at least 8 characters. Your password is stored as a secure hash.
            </p>
          )}
        </form>
        <Button
          className="flex w-full h-10 items-center justify-center rounded-xl"
        >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in with email" : "Create account"}
        </Button>
      </div>
    </main>
  );
}
