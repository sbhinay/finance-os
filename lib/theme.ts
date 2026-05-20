import type { CSSProperties } from "react";

export const theme = {
  colors: {
    pageBg: "#f4f7fb",
    pageGlow: "radial-gradient(circle at top right, rgba(31,94,255,0.08), transparent 30%), radial-gradient(circle at left 15%, rgba(15,118,110,0.06), transparent 28%), #f4f7fb",
    surface: "#ffffff",
    surfaceAlt: "#f8fbff",
    surfaceMuted: "#eef3f8",
    border: "#d7e0ea",
    borderStrong: "#c3d0dd",
    text: "#142033",
    textSoft: "#5f6f86",
    textMuted: "#8d99ab",
    sidebar: "#162131",
    sidebarAlt: "#1d2a3d",
    sidebarText: "rgba(255,255,255,0.76)",
    sidebarMuted: "rgba(255,255,255,0.42)",
    primary: "#1f5eff",
    primaryHover: "#184ed6",
    primarySoft: "#e8efff",
    success: "#15803d",
    successSoft: "#e8f7ee",
    warning: "#b7791f",
    warningSoft: "#fff4db",
    danger: "#b42318",
    dangerSoft: "#fdeceb",
  },
  radius: {
    sm: 10,
    md: 16,
    lg: 22,
    pill: 999,
  },
  shadow: {
    card: "0 10px 30px rgba(18, 32, 51, 0.06)",
    shell: "0 24px 60px rgba(18, 32, 51, 0.12)",
    soft: "0 6px 18px rgba(18, 32, 51, 0.06)",
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

