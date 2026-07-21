import type { CSSProperties, ReactNode } from "react";
import { theme } from "@/lib/theme";

type Tone = "primary" | "secondary" | "success" | "warning" | "danger";

const toneStyles: Record<Tone, { background: string; color: string; border: string }> = {
  primary: {
    background: theme.colors.primary,
    color: "#ffffff",
    border: theme.colors.primary,
  },
  secondary: {
    background: theme.colors.surfaceAlt,
    color: theme.colors.text,
    border: theme.colors.border,
  },
  success: {
    background: theme.colors.successSoft,
    color: theme.colors.success,
    border: theme.colors.successSoft,
  },
  warning: {
    background: theme.colors.warningSoft,
    color: theme.colors.warning,
    border: theme.colors.warningSoft,
  },
  danger: {
    background: theme.colors.dangerSoft,
    color: theme.colors.danger,
    border: theme.colors.dangerSoft,
  },
};

export function SurfaceCard({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="finance-card" style={{ ...theme.cardStyle(accent), ...style }}>
      {children}
    </div>
  );
}

export function ActionButton({
  children,
  tone = "primary",
  compact,
  onClick,
  disabled,
  style,
}: {
  children: ReactNode;
  tone?: Tone;
  compact?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="finance-button"
      style={{
        padding: compact ? "7px 12px" : "10px 16px",
        borderRadius: theme.radius.pill,
        border: `1px solid ${toneStyle.border}`,
        background: toneStyle.background,
        color: toneStyle.color,
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function StatusChip({
  children,
  tone = "secondary",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <span
      className="finance-chip"
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 22,
        padding: "2px 9px",
        borderRadius: theme.radius.pill,
        background: toneStyle.background,
        color: toneStyle.color,
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}
