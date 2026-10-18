"use client";

import { ConfigProvider } from "antd";

const theme = {
  token: {
    colorPrimary: "#5d7d43",
    colorSuccess: "#3f815b",
    colorWarning: "#c58b35",
    colorError: "#c44848",
    colorText: "#17251f",
    colorTextSecondary: "#68766d",
    colorBorder: "#dce4dc",
    colorBgContainer: "#ffffff",
    borderRadius: 10,
    controlHeight: 40,
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadowSecondary: "0 12px 34px rgb(25 48 36 / 8%)",
  },
  components: {
    Button: { fontWeight: 600, primaryShadow: "0 4px 10px rgb(93 125 67 / 18%)" },
    Input: { activeBorderColor: "#6eaa8b", hoverBorderColor: "#8eaf7a" },
    Select: { activeBorderColor: "#6eaa8b", hoverBorderColor: "#8eaf7a" },
    DatePicker: { activeBorderColor: "#6eaa8b", hoverBorderColor: "#8eaf7a" },
    Card: { borderRadiusLG: 16 },
  },
};

export default function AntdProvider({ children }) {
  return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
}
