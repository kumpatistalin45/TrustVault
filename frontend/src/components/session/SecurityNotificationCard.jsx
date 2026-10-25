import React from "react";
import { Shield, Monitor, Bell } from "lucide-react";

export function SecurityNotificationCard({
  role = "viewer",
  currentDevice = "Chrome 126 on Windows 11 (Current Session)",
  emailAlertsEnabled = true,
  className = ""
}) {
  return (
    <div
      className={`card-white ${className}`}
      style={{
        padding: "24px",
        borderRadius: "24px",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "12px",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a"
            }}
          >
            <Shield size={18} />
          </div>
          <div>
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0
              }}
            >
              Single-Device Policy & Security
            </h4>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              Enterprise Session Protection • {role.toUpperCase()}
            </span>
          </div>
        </div>

        <span
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            color: "#059669",
            padding: "3px 10px",
            borderRadius: "9999px",
            fontSize: "11px",
            fontWeight: 700
          }}
        >
          ACTIVE
        </span>
      </div>

      <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "16px" }}>
        TrustVault enforces a strict single-device session policy to prevent unauthorized concurrent access to sensitive documents. If a new login occurs from another browser or workstation, any active session will be replaced.
      </p>

      {/* Active Device Box */}
      <div
        className="frosted-panel"
        style={{
          padding: "12px 16px",
          borderRadius: "14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "16px",
          fontSize: "12.5px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Monitor size={15} color="var(--text-muted)" />
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{currentDevice}</span>
        </div>
        <span style={{ color: "#059669", fontWeight: 600, fontSize: "11.5px" }}>This Device</span>
      </div>

      {/* Email Alert Status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 4px 4px 4px",
          borderTop: "1px solid rgba(226, 232, 240, 0.8)",
          fontSize: "12.5px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Bell size={14} color="var(--text-muted)" />
          <span style={{ color: "var(--text-secondary)" }}>New device email notifications</span>
        </div>

        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: "#059669",
            background: "rgba(16, 185, 129, 0.12)",
            padding: "3px 10px",
            borderRadius: "9999px"
          }}
        >
          Enabled
        </span>
      </div>
    </div>
  );
}

export default SecurityNotificationCard;
