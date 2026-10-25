import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Smartphone, Monitor, Globe, Clock, ArrowRight, AlertTriangle } from "lucide-react";

export function SessionReplacedNotice({
  role = "viewer",
  deviceInfo = {
    browser: "Chrome 126 / Windows 11",
    ip: "192.168.1.104",
    location: "Corporate VPN Gateway (San Francisco, CA)",
    timestamp: new Date().toISOString()
  },
  onReauthenticate,
  className = "",
  style = {}
}) {
  const formattedTime = new Date(deviceInfo.timestamp || Date.now()).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <div
      className={`session-replaced-notice card-white ${className}`}
      style={{
        padding: "32px",
        borderRadius: "28px",
        maxWidth: "580px",
        margin: "0 auto",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.12)",
        border: "1px solid rgba(239, 68, 68, 0.2)",
        ...style
      }}
    >
      {/* Header with warning icon */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", marginBottom: "20px" }}>
        <div
          style={{
            width: "48px",
            height: "48px",
            borderRadius: "16px",
            background: "rgba(239, 68, 68, 0.1)",
            color: "#dc2626",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <ShieldAlert size={24} />
        </div>
        <div>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#dc2626",
              display: "block",
              marginBottom: "4px"
            }}
          >
            Single-Device Session Alert • {role.toUpperCase()}
          </span>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.01em"
            }}
          >
            Signed In on Another Device
          </h3>
        </div>
      </div>

      {/* Main explanation message */}
      <p
        style={{
          fontSize: "14px",
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          marginBottom: "20px"
        }}
      >
        Your TrustVault account was recently accessed from a new device or browser session. In accordance with enterprise single-device security policy, concurrent sessions are restricted to ensure document confidentiality.
      </p>

      {/* Detected New Device Metadata */}
      <div
        className="frosted-panel"
        style={{
          borderRadius: "18px",
          padding: "16px",
          marginBottom: "20px",
          background: "rgba(248, 250, 252, 0.8)",
          display: "flex",
          flexDirection: "column",
          gap: "10px"
        }}
      >
        <span
          style={{
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-muted)"
          }}
        >
          New Session Details
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
          <Monitor size={15} color="var(--text-muted)" />
          <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>{deviceInfo.browser}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
          <Globe size={15} color="var(--text-muted)" />
          <span style={{ color: "var(--text-secondary)" }}>
            IP: <span style={{ fontFamily: "var(--font-mono)" }}>{deviceInfo.ip}</span> ({deviceInfo.location})
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px" }}>
          <Clock size={15} color="var(--text-muted)" />
          <span style={{ color: "var(--text-secondary)" }}>{formattedTime}</span>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {onReauthenticate ? (
          <button
            type="button"
            onClick={onReauthenticate}
            className="btn-primary"
            style={{
              flex: 1,
              padding: "11px 20px",
              fontSize: "13.5px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>Re-authenticate This Device</span>
            <ArrowRight size={14} />
          </button>
        ) : (
          <Link
            to="/login"
            className="btn-primary"
            style={{
              flex: 1,
              padding: "11px 20px",
              fontSize: "13.5px",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px"
            }}
          >
            <span>Re-authenticate This Device</span>
            <ArrowRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

export default SessionReplacedNotice;
