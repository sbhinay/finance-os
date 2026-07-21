import type { CSSProperties } from "react";

export const theme = {
  colors: {
    pageBg: "#f4f7fb",
    pageGlow: "linear-gradient(115deg, rgba(15, 118, 110, 0.12), transparent 34rem), radial-gradient(circle at 86% 8%, rgba(245, 158, 11, 0.09), transparent 28rem), linear-gradient(135deg, #fbfdff 0%, #f4f7fb 52%, #f6f8fb 100%)",
    surface: "#ffffff",
    surfaceAlt: "#f7fafc",
    surfaceMuted: "#edf4f7",
    border: "#d5e2ec",
    borderStrong: "#a9bdcb",
    text: "#172033",
    textSoft: "#475569",
    textMuted: "#8a98aa",
    sidebar: "#ffffff",
    sidebarAlt: "#f7fafc",
    sidebarText: "#334155",
    sidebarMuted: "#7b8794",
    primary: "#0f766e",
    primaryHover: "#0d5f59",
    primarySoft: "#dff7f2",
    success: "#13803d",
    successSoft: "#eaf7ef",
    warning: "#b45309",
    warningSoft: "#fff5df",
    danger: "#dc2626",
    dangerSoft: "#fff0ee",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    pill: 999,
  },
  shadow: {
    card: "0 12px 30px rgba(15, 23, 42, 0.07)",
    shell: "0 24px 64px rgba(15, 23, 42, 0.18)",
    soft: "0 8px 20px rgba(15, 23, 42, 0.08)",
  },
  cardStyle(accentColor?: string): CSSProperties {
    return {
      background: theme.colors.surface,
      border: `1px solid ${theme.colors.border}`,
      borderTop: accentColor ? `3px solid ${accentColor}` : `1px solid ${theme.colors.border}`,
      borderRadius: theme.radius.md,
      boxShadow: theme.shadow.card,
      backdropFilter: "saturate(1.1)",
    };
  },
};

