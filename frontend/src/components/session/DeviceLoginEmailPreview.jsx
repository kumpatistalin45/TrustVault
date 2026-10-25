import React from "react";
import { Mail, Shield, AlertTriangle, ExternalLink } from "lucide-react";

export function DeviceLoginEmailPreview({ role = "viewer", className = "" }) {
  return (
    <div
      className={`device-login-email-preview ${className}`}
      style={{
        border: "1px dashed rgba(99, 102, 241, 0.4)",
        borderRadius: "18px",
        padding: "18px",
        background: "rgba(248, 250, 252, 0.95)",
        fontSize: "12.5px"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Mail size={14} color="#6366f1" />
          <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
            [Development Preview] Security Alert Email Template
          </span>
        </div>
        <span
          style={{
            fontSize: "10.5px",
            fontFamily: "var(--font-mono)",
            background: "rgba(99, 102, 241, 0.12)",
            color: "#4f46e5",
            padding: "2px 8px",
            borderRadius: "6px"
          }}
        >
          Phase 1 Mock Spec
        </span>
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: "12px",
          padding: "16px",
          border: "1px solid #e2e8f0",
          boxShadow: "0 2px 6px rgba(15, 23, 42, 0.04)"
        }}
      >
        <div style={{ borderBottom: "1px solid #f1f5f9", paddingBottom: "10px", marginBottom: "12px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "2px" }}>
            From: <strong>TrustVault Enterprise Security &lt;security-alerts@trustvault.internal&gt;</strong>
          </div>
          <div style={{ color: "var(--text-muted)", fontSize: "11px", marginBottom: "2px" }}>
            Subject: <strong>Notice: New Sign-in Detected for your TrustVault Account ({role.toUpperCase()})</strong>
          </div>
        </div>

        <p style={{ margin: "0 0 10px 0", color: "var(--text-primary)", fontWeight: 600 }}>
          Hello Employee,
        </p>

        <p style={{ margin: "0 0 12px 0", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Your TrustVault account was signed in from a new device:
        </p>

        <ul style={{ margin: "0 0 14px 0", paddingLeft: "20px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <li><strong>Device / Browser:</strong> Chrome 126 on Windows 11</li>
          <li><strong>IP Address:</strong> 192.168.1.104</li>
          <li><strong>Estimated Location:</strong> San Francisco, United States</li>
          <li><strong>Time:</strong> {new Date().toUTCString()}</li>
        </ul>

        <p style={{ margin: "0 0 14px 0", color: "var(--text-secondary)", lineHeight: 1.5 }}>
          In accordance with the <strong>Single-Device Security Policy</strong>, prior active sessions have been invalidated. If you initiated this login, no further action is required.
        </p>

        <div style={{ background: "rgba(239, 68, 68, 0.06)", borderLeft: "3px solid #dc2626", padding: "8px 12px", borderRadius: "4px" }}>
          <span style={{ color: "#dc2626", fontWeight: 600 }}>Didn't sign in?</span>{" "}
          <span style={{ color: "var(--text-secondary)" }}>Change your password immediately and contact your security administrator.</span>
        </div>
      </div>

      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "10px 0 0 0", fontStyle: "italic" }}>
        Note: The automated dispatch of this email will be integrated with the email service gateway in Phase 2.
      </p>
    </div>
  );
}

export default DeviceLoginEmailPreview;
