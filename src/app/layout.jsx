import { jsx as _jsx } from "react/jsx-runtime";
import "./globals.css";
import AuthGate from "@/components/auth-gate";
export const metadata = {
    title: "Assistant — Your day, under control",
    description: "A proactive AI executive assistant for your workday."
};
export default function RootLayout({ children }) {
    return (_jsx("html", { lang: "en", children: _jsx("body", { children: _jsx(AuthGate, { children: children }) }) }));
}
