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

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        marginBottom: 18,
      }}
    >
      <div>
        <div
          style={{
            fontWeight: 800,
            fontSize: 25,
            color: theme.colors.text,
            marginBottom: subtitle ? 5 : 0,
            letterSpacing: 0,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: theme.colors.textSoft, lineHeight: 1.5 }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}

export function MetricGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 12,
        marginBottom: 18,
      }}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  sub,
  tone = "secondary",
  color,
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  color?: string;
  style?: CSSProperties;
}) {
  const toneStyle = toneStyles[tone];
  return (
    <SurfaceCard
      style={{
        padding: "16px 18px",
        background: `linear-gradient(180deg, ${theme.colors.surface}, ${theme.colors.surfaceAlt})`,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: theme.colors.textSoft,
          fontWeight: 700,
          textTransform: "uppercase",
          marginBottom: 7,
          letterSpacing: 0,
        }}
      >
        {label}
      </div>
      <div style={{ fontWeight: 750, fontSize: 21, color: color ?? toneStyle.color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>{sub}</div>}
    </SurfaceCard>
  );
}

export function DataPanel({
  title,
  children,
  accent,
  actions,
  style,
}: {
  title?: string;
  children: ReactNode;
  accent?: string;
  actions?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <SurfaceCard accent={accent} style={{ overflow: "hidden", ...style }}>
      {(title || actions) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderBottom: `1px solid ${theme.colors.border}`,
            background: theme.colors.surfaceAlt,
          }}
        >
          {title && <div style={{ fontSize: 14, fontWeight: 750, color: theme.colors.text }}>{title}</div>}
          {actions}
        </div>
      )}
      {children}
    </SurfaceCard>
  );
}

export function Toolbar({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: 12,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        background: "rgba(255,255,255,0.84)",
        boxShadow: theme.shadow.soft,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail?: string;
}) {
  return (
    <div style={{ textAlign: "center", color: theme.colors.textSoft, padding: "28px 18px", fontSize: 13 }}>
      <div style={{ fontWeight: 750, color: theme.colors.text, marginBottom: detail ? 4 : 0 }}>{title}</div>
      {detail && <div>{detail}</div>}
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
        fontWeight: 700,
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
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}
