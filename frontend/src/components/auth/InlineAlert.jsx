import React from "react";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export function InlineAlert({
  type = "error",
  message,
  onClose,
  className = "",
  style = {}
}) {
  if (!message) return null;

  const isError = type === "error";
  const isSuccess = type === "success";
  const isWarning = type === "warning";

  const config = {
    error: {
      bg: "rgba(239, 68, 68, 0.08)",
      border: "1px solid rgba(239, 68, 68, 0.25)",
      color: "#dc2626",
      icon: AlertCircle
    },
    warning: {
      bg: "rgba(245, 158, 11, 0.08)",
      border: "1px solid rgba(245, 158, 11, 0.25)",
      color: "#d97706",
      icon: AlertTriangle
    },
    success: {
      bg: "rgba(16, 185, 129, 0.08)",
      border: "1px solid rgba(16, 185, 129, 0.25)",
      color: "#059669",
      icon: CheckCircle2
    },
    info: {
      bg: "rgba(59, 130, 246, 0.08)",
      border: "1px solid rgba(59, 130, 246, 0.25)",
      color: "#2563eb",
      icon: Info
    }
  }[type] || {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    color: "#dc2626",
    icon: AlertCircle
  };

  const IconComponent = config.icon;

  return (
    <div
      role="alert"
      aria-live={isError ? "assertive" : "polite"}
      className={`inline-alert ${className}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        padding: "12px 14px",
        borderRadius: "14px",
        background: config.bg,
        border: config.border,
        color: config.color,
        fontSize: "13px",
        lineHeight: 1.45,
        marginBottom: "16px",
        transition: "all 0.2s ease",
        ...style
      }}
    >
      <div style={{ flexShrink: 0, marginTop: "1px" }}>
        <IconComponent size={16} />
      </div>

      <div style={{ flex: 1, fontWeight: 500 }}>
        {message}
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss alert"
          style={{
            background: "transparent",
            border: "none",
            color: config.color,
            cursor: "pointer",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.75,
            transition: "opacity 0.15s ease"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.75")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default InlineAlert;
