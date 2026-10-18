import "@ant-design/v5-patch-for-react-19";
import "antd/dist/reset.css";
import { Montserrat, Poppins, Roboto, Pacifico } from "next/font/google";
import "./globals.css";
import AntdProvider from "@/components/antd-provider";
import AuthGate from "@/components/auth-gate";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-montserrat",
  display: "swap",
});
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});
const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700", "900"],
  variable: "--font-roboto",
  display: "swap",
});
const pacifico = Pacifico({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pacifico",
  display: "swap",
});

export const metadata = {
  title: "Assistant — Your day, under control",
  description: "A proactive AI executive assistant for your workday.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${poppins.variable} ${roboto.variable} ${pacifico.variable}`}>
      <body suppressHydrationWarning>
        <AntdProvider>
          <AuthGate>{children}</AuthGate>
        </AntdProvider>
      </body>
    </html>
  );
}
