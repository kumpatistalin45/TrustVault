import React from "react";
import { CheckCircle2, Clock, AlertTriangle, XCircle, ShieldAlert } from "lucide-react";

export function StatusBadge({ status, type = "status", size = "sm" }) {
  const s = String(status || "active").toLowerCase();

  let bg = "rgba(15, 23, 42, 0.06)";
  let color = "var(--text-secondary)";
  let borderColor = "rgba(15, 23, 42, 0.12)";
  let label = status;
  let Icon = null;

  if (s === "active" || s === "approved" || s === "granted") {
    bg = "rgba(16, 185, 129, 0.1)";
    color = "#059669";
    borderColor = "rgba(16, 185, 129, 0.25)";
    Icon = CheckCircle2;
    label = s === "approved" ? "Approved" : s === "granted" ? "Access Granted" : "Active";
  } else if (s === "pending") {
    bg = "rgba(245, 158, 11, 0.1)";
    color = "#d97706";
    borderColor = "rgba(245, 158, 11, 0.25)";
    Icon = Clock;
    label = type === "approval" ? "Pending Approval" : "Pending";
  } else if (s === "suspended" || s === "revoked" || s === "restricted") {
    bg = "rgba(239, 68, 68, 0.1)";
    color = "#dc2626";
    borderColor = "rgba(239, 68, 68, 0.25)";
    Icon = s === "revoked" ? ShieldAlert : AlertTriangle;
    label = s === "revoked" ? "Access Revoked" : s === "restricted" ? "Restricted" : "Suspended";
  } else if (s === "rejected" || s === "inactive") {
    bg = "rgba(100, 116, 139, 0.1)";
    color = "#64748b";
    borderColor = "rgba(100, 116, 139, 0.2)";
    Icon = XCircle;
    label = s === "rejected" ? "Rejected" : "Inactive";
  }

  const isSmall = size === "sm";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: isSmall ? "3px 10px" : "5px 12px",
        borderRadius: "9999px",
        fontSize: isSmall ? "11.5px" : "12.5px",
        fontWeight: 600,
        background: bg,
        color: color,
        border: `1px solid ${borderColor}`,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap"
      }}
    >
      {Icon && <Icon size={isSmall ? 12 : 14} />}
      <span>{label}</span>
    </span>
  );
}

export default StatusBadge;
