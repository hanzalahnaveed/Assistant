import "antd/dist/reset.css";
import "./globals.css";
import AntdProvider from "@/components/antd-provider";
import AuthGate from "@/components/auth-gate";

export const metadata = {
  title: "Assistant — Your day, under control",
  description: "A proactive AI executive assistant for your workday.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AntdProvider>
          <AuthGate>{children}</AuthGate>
        </AntdProvider>
      </body>
    </html>
  );
}
