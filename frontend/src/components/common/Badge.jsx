import React from "react";
import { Shield, Eye, Edit3, Key, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export function Badge({ type, variant, label, children, size = "md", icon = true, className = "" }) {
  const effectiveType = variant || type || (typeof children === "string" ? children : "") || label || "";
  const normalized = effectiveType.toLowerCase();

  let badgeClass = "badge-viewer";
  let displayIcon = null;
  let text = children || label || type || variant;

  if (normalized === "admin") {
    badgeClass = "badge-admin";
    displayIcon = <Shield size={12} />;
    text = "ADMIN";
  } else if (normalized === "owner") {
    badgeClass = "badge-owner";
    displayIcon = <Key size={12} />;
    text = "OWNER";
  } else if (normalized === "viewer") {
    badgeClass = "badge-viewer";
    displayIcon = <Eye size={12} />;
    text = "VIEWER";
  } else if (normalized === "read") {
    badgeClass = "badge-read";
    displayIcon = <Eye size={12} />;
    text = "READ";
  } else if (normalized === "edit") {
    badgeClass = "badge-edit";
    displayIcon = <Edit3 size={12} />;
    text = "EDIT";
  } else if (normalized === "success") {
    badgeClass = "badge-success";
    displayIcon = <CheckCircle size={12} />;
    text = "SUCCESS";
  } else if (normalized === "denied") {
    badgeClass = "badge-denied";
    displayIcon = <XCircle size={12} />;
    text = "DENIED";
  } else if (normalized === "failure") {
    badgeClass = "badge-failure";
    displayIcon = <AlertTriangle size={12} />;
    text = "FAILURE";
  }

  return (
    <span className={`badge ${badgeClass}`} style={{ fontSize: size === "sm" ? "10px" : "11px" }}>
      {icon && displayIcon}
      <span>{text}</span>
    </span>
  );
}

export default Badge;

