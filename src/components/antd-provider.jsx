"use client";

import { ConfigProvider } from "antd";

const theme = {
  token: {
    colorPrimary: "#FA8500",
    colorInfo: "#FA8500",
    colorSuccess: "#3f815b",
    colorWarning: "#c58b35",
    colorError: "#c44848",
    colorText: "#212529",
    colorTextSecondary: "#6B7280",
    colorBorder: "#E3E7ED",
    colorBgContainer: "#ffffff",
    colorBgLayout: "#F8F9FA",
    borderRadius: 10,
    controlHeight: 40,
    fontFamily: 'var(--font-montserrat), Montserrat, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadowSecondary: "0 12px 30px rgb(35 48 68 / 7%)",
  },
  components: {
    Button: {
      fontWeight: 600,
      primaryShadow: "0 4px 10px rgb(250 133 0 / 18%)",
      defaultColor: "#233044",
      defaultBorderColor: "#E3E7ED",
    },
    Input: { activeBorderColor: "#FA8500", hoverBorderColor: "#FA8500" },
    Select: { activeBorderColor: "#FA8500", hoverBorderColor: "#FA8500" },
    DatePicker: { activeBorderColor: "#FA8500", hoverBorderColor: "#FA8500" },
    Card: { borderRadiusLG: 16 },
  },
};

export default function AntdProvider({ children }) {
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}
