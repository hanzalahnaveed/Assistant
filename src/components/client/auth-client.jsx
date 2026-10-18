"use client";
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
const queryErrors = {
    google_not_configured: "Google sign-in is not configured. Use your email and password, or configure Google Workspace later.",
    google_consent_cancelled: "Google sign-in was cancelled. You can try again whenever you're ready.",
    invalid_oauth_state: "Your sign-in session expired or could not be verified. Please try again.",
    google_connection_failed: "We couldn't complete Google sign-in. Please try again.",
    account_not_found: "No account exists for that Google account yet. Choose Create account to get started.",
    account_exists: "An account already exists for that Google account. Choose Sign in instead."
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
        setError(queryError ? queryErrors[queryError] ?? "Something went wrong. Please try again." : null);
        setLoggedOut(params.get("loggedOut") === "1");
        if (queryError === "account_not_found")
            setMode("signup");
        if (queryError === "account_exists")
            setMode("signin");
        let cancelled = false;
        fetch("/api/auth/session", { cache: "no-store" })
            .then(response => response.json())
            .then(data => { if (!cancelled && data.user)
            window.location.replace("/"); })
            .catch(() => undefined)
            .finally(() => { if (!cancelled)
            setChecking(false); });
        return () => { cancelled = true; };
    }, []);
    async function submitCredentials(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(mode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ name: name.trim(), email: email.trim(), password })
            });
            const responseText = await response.text();
            let data = {};
            try {
                data = JSON.parse(responseText);
            }
            catch {
                if (!response.ok) {
                    setError("The server returned an unexpected response (HTTP " + response.status + "). Check the terminal running Next.js for the underlying error.");
                    return;
                }
                throw new Error("The server returned an invalid response.");
            }
            if (!response.ok) {
                setError(data.message ?? (data.error === "account_exists"
                    ? "An account with this email already exists. Please sign in."
                    : "The request failed (HTTP " + response.status + "). Check the server logs if this continues."));
                return;
            }
            window.location.assign("/");
        }
        catch (error) {
            if (error instanceof TypeError) {
                setError("We couldn't reach the server. Check that the app is running at this address and try again.");
            }
            else {
                setError(error instanceof Error ? error.message : "The server returned an invalid response. Check the Next.js terminal logs.");
            }
        }
        finally {
            setBusy(false);
        }
    }
    function continueWithGoogle() {
        setBusy(true);
        window.location.assign("/api/auth/google/start?intent=" + mode);
    }
    return (_jsxs("main", { className: "auth-page", children: [_jsxs("section", { className: "auth-visual", "aria-label": "Assistant workspace introduction", children: [_jsxs("a", { href: "/auth", className: "auth-brand", children: [_jsx("span", { className: "auth-brand-mark", children: _jsx(Sparkles, { size: 20 }) }), _jsxs("span", { children: ["assistant", _jsx("span", { className: "workspace-brand-dot", children: "." })] })] }), _jsxs("div", { className: "auth-visual-copy", children: [_jsxs("span", { className: "auth-eyebrow", children: [_jsx("span", { className: "status-dot" }), " YOUR WORKDAY, IN FOCUS"] }), _jsx("h1", { children: "Make room for the work that matters." }), _jsx("p", { children: "One calm workspace for your priorities, meetings, follow-ups, and next best actions." }), _jsxs("div", { className: "auth-feature-list", children: [_jsxs("div", { children: [_jsx("span", { children: _jsx(CheckCircle2, { size: 17 }) }), _jsxs("div", { children: [_jsx("strong", { children: "Know what needs attention" }), _jsx("small", { children: "Start with a prioritized daily briefing." })] })] }), _jsxs("div", { children: [_jsx("span", { children: _jsx(CalendarDays, { size: 17 }) }), _jsxs("div", { children: [_jsx("strong", { children: "Bring your day together" }), _jsx("small", { children: "See tasks and calendar context in one place." })] })] }), _jsxs("div", { children: [_jsx("span", { children: _jsx(ShieldCheck, { size: 17 }) }), _jsxs("div", { children: [_jsx("strong", { children: "You stay in control" }), _jsx("small", { children: "Review proposed actions before they run." })] })] })] })] }), _jsxs("div", { className: "auth-visual-footer", children: [_jsx("span", { children: "PERSONAL EXECUTIVE WORKSPACE" }), _jsx("span", { children: "Thoughtful by design." })] })] }), _jsxs("section", { className: "auth-panel", children: [_jsxs("div", { className: "auth-mobile-brand", children: [_jsx("span", { className: "auth-brand-mark", children: _jsx(Sparkles, { size: 19 }) }), _jsxs("strong", { children: ["assistant", _jsx("span", { className: "workspace-brand-dot", children: "." })] })] }), _jsxs("div", { className: "auth-card", children: [_jsxs("div", { className: "auth-card-kicker", children: [_jsx("span", { className: "auth-card-icon", children: _jsx(ShieldCheck, { size: 16 }) }), " SECURE ACCESS"] }), _jsx("h2", { children: mode === "signin" ? "Welcome back" : "Create your account" }), _jsx("p", { className: "auth-subtitle", children: mode === "signin" ? "Sign in to pick up where your workday left off." : "Set up your personal workspace with your email." }), _jsxs("div", { className: "auth-mode-switch", role: "tablist", "aria-label": "Account access", children: [_jsx("button", { type: "button", role: "tab", "aria-selected": mode === "signin", className: mode === "signin" ? "active" : "", onClick: () => { setMode("signin"); setError(null); }, children: "Sign in" }), _jsx("button", { type: "button", role: "tab", "aria-selected": mode === "signup", className: mode === "signup" ? "active" : "", onClick: () => { setMode("signup"); setError(null); }, children: "Create account" })] }), error && _jsxs("div", { role: "alert", className: "auth-alert", children: [_jsx("span", { children: "!" }), _jsx("p", { children: error })] }), loggedOut && _jsxs("div", { role: "status", className: "auth-success", children: [_jsx(CheckCircle2, { size: 16 }), _jsx("span", { children: "You have been signed out securely." })] }), _jsxs("form", { className: "auth-credentials-form", onSubmit: submitCredentials, children: [mode === "signup" && _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: "Your name" }), _jsx("input", { autoComplete: "name", name: "name", type: "text", maxLength: 80, value: name, onChange: event => setName(event.target.value), placeholder: "How should we address you?" })] }), _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: "Email address" }), _jsx("input", { autoComplete: "email", name: "email", type: "email", required: true, maxLength: 254, value: email, onChange: event => setEmail(event.target.value), placeholder: "you@company.com" })] }), _jsxs("label", { className: "auth-field", children: [_jsx("span", { children: "Password" }), _jsx("input", { autoComplete: mode === "signup" ? "new-password" : "current-password", name: "password", type: "password", required: true, minLength: mode === "signup" ? 8 : 1, maxLength: 128, value: password, onChange: event => setPassword(event.target.value), placeholder: mode === "signup" ? "At least 8 characters" : "Enter your password" })] }), mode === "signup" && _jsx("p", { className: "auth-password-hint", children: "Use at least 8 characters. Your password is stored as a secure hash." }), _jsxs("button", { type: "submit", className: "auth-google-button auth-primary-button", disabled: busy || checking, children: [busy || checking ? _jsx(LoaderCircle, { size: 18, className: "animate-spin" }) : _jsx("span", { className: "auth-primary-mark", children: _jsx(ShieldCheck, { size: 17 }) }), _jsx("span", { children: busy ? "Please wait…" : mode === "signin" ? "Sign in with email" : "Create account" }), !busy && !checking && _jsx(ArrowRight, { size: 16, className: "auth-button-arrow" })] })] }), _jsxs("div", { className: "auth-divider", children: [_jsx("span", {}), " ", _jsx("small", { children: "OR CONTINUE WITH" }), " ", _jsx("span", {})] }), _jsxs("button", { type: "button", className: "auth-google-button auth-secondary-button", onClick: continueWithGoogle, disabled: busy || checking, children: [busy || checking ? _jsx(LoaderCircle, { size: 18, className: "animate-spin" }) : _jsx(GoogleMark, {}), _jsx("span", { children: mode === "signin" ? "Continue with Google" : "Create account with Google" }), _jsx(ArrowRight, { size: 16, className: "auth-button-arrow" })] }), _jsxs("div", { className: "auth-trust-note", children: [_jsx(ShieldCheck, { size: 17 }), _jsx("p", { children: "Google is optional for sign-in. Connect Google Workspace later if you want inbox and calendar context." })] }), _jsx("p", { className: "auth-terms", children: "Your workspace data is private to your account. Never reuse a password you use for another service." }), _jsxs("div", { className: "auth-switch-copy", children: [mode === "signin" ? "New to Assistant?" : "Already have an account?", " ", _jsx("button", { type: "button", onClick: () => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }, children: mode === "signin" ? "Create an account" : "Sign in instead" })] })] }), _jsxs("div", { className: "auth-panel-footer", children: [_jsxs("span", { children: [_jsx(Clock3, { size: 13 }), " A clearer start to your day"] }), _jsx("span", { children: "Privacy-first access" })] })] })] }));
}
function GoogleMark() {
    return _jsxs("svg", { width: "19", height: "19", viewBox: "0 0 48 48", "aria-hidden": "true", children: [_jsx("path", { fill: "#EA4335", d: "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2 13.22l7.98 6.19C11.88 13.72 17.48 9.5 24 9.5z" }), _jsx("path", { fill: "#4285F4", d: "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.76 7.18l7.73 6C44.42 37.98 46.98 31.86 46.98 24.55z" }), _jsx("path", { fill: "#FBBC05", d: "M9.98 28.59A14.4 14.4 0 0 1 9.2 24c0-1.6.28-3.15.78-4.59L2 13.22A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.42-6.19z" }), _jsx("path", { fill: "#34A853", d: "M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.14 1.45-4.89 2.3-8.18 2.3-6.52 0-12.12-4.22-14.02-10.09L2 34.78C6.51 42.62 14.62 48 24 48z" })] });
}
