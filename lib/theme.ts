import type { CSSProperties } from "react";

export const theme = {
  colors: {
    pageBg: "#f3f6fb",
    pageGlow: "linear-gradient(135deg, #f7f9fc 0%, #eef4fb 46%, #f8fafc 100%)",
    surface: "#ffffff",
    surfaceAlt: "#f8fafc",
    surfaceMuted: "#eef4f9",
    border: "#d8e1ec",
    borderStrong: "#b8c7d8",
    text: "#111827",
    textSoft: "#526277",
    textMuted: "#8a98aa",
    sidebar: "#111827",
    sidebarAlt: "#172033",
    sidebarText: "rgba(255,255,255,0.78)",
    sidebarMuted: "rgba(255,255,255,0.42)",
    primary: "#2563eb",
    primaryHover: "#1d4ed8",
    primarySoft: "#e8f0ff",
    success: "#13803d",
    successSoft: "#eaf7ef",
    warning: "#a16207",
    warningSoft: "#fff7df",
    danger: "#b42318",
    dangerSoft: "#fff0ee",
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 18,
    pill: 999,
  },
  shadow: {
    card: "0 12px 28px rgba(15, 23, 42, 0.07)",
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
    };
  },
};

