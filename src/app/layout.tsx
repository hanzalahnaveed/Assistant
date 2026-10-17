import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assistant — Your day, under control",
  description: "A proactive AI executive assistant for your workday."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
