import React from "react";
import { useAuth } from "../context/AuthContext";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import {
  ShieldCheck,
  Lock,
  Key,
  ShieldAlert,
  Server,
  Globe,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info
} from "lucide-react";

export function SecurityActivityPage() {
  const { user, role } = useAuth();

  const securityControls = [
    {
      title: "AES-256-GCM Envelope Encryption",
      description: "Documents stored in binary TVE1 envelopes with 12-byte initialization vectors and 16-byte authentication tags.",
      status: "ACTIVE",
      variant: "success",
      icon: <Lock size={18} color="#059669" />
    },
    {
      title: "HMAC Double-Submit CSRF Defense",
      description: "State mutations require session-bound X-CSRF-Token headers verified via cryptographic HMAC secret.",
      status: "ENFORCED",
      variant: "success",
      icon: <ShieldCheck size={18} color="#2563eb" />
    },
    {
      title: "15-Minute Sliding Session Expiration",
      description: "PostgreSQL-backed session storage with sliding expiration and session ID regeneration upon authentication.",
      status: "PROTECTED",
      variant: "success",
      icon: <Clock size={18} color="#4f46e5" />
    },
    {
      title: "Password Hashing with Timing Mitigation",
      description: "Stored with bcrypt (12 rounds) and dummy hash computation for non-existent accounts to prevent enumeration.",
      status: "VERIFIED",
      variant: "success",
      icon: <Key size={18} color="#7c3aed" />
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "30px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                letterSpacing: "-0.02em"
              }}
            >
              Security Activity & Posture
            </h1>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                color: "#059669",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                padding: "3px 12px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              HARDENED
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
            Cryptographic status and zero-trust controls protecting your authenticated employee workspace.
          </p>
        </div>
      </div>

      {/* Active Session Identity Card */}
      <div className="card-white" style={{ padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "4px"
              }}
            >
              Session Clearance
            </span>
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0
              }}
            >
              Active Employee Session Identity
            </h2>
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--text-muted)",
              background: "rgba(0,0,0,0.03)",
              padding: "4px 10px",
              borderRadius: "9999px"
            }}
          >
            Zero-Trust Bound
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px"
          }}
        >
          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              padding: "16px 18px",
              borderRadius: "18px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Authenticated User
            </span>
            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginTop: "6px" }}>
              {user?.name || "Employee"}
            </div>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              {user?.email || "employee@trustvault.local"}
            </span>
          </div>

          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              padding: "16px 18px",
              borderRadius: "18px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Platform Role
            </span>
            <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  background: "#0f172a",
                  color: "#ffffff",
                  padding: "2px 10px",
                  borderRadius: "9999px",
                  fontSize: "11.5px",
                  fontWeight: 600
                }}
              >
                {role || "employee"}
              </span>
            </div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "6px", display: "block" }}>
              Discretionary Access Control
            </span>
          </div>

          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              padding: "16px 18px",
              borderRadius: "18px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Session Cookie Policies
            </span>
            <div style={{ fontSize: "12.5px", fontWeight: 600, color: "#059669", marginTop: "6px", fontFamily: "var(--font-mono)" }}>
              HttpOnly • SameSite=Lax
            </div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
              Protected against token harvesting
            </span>
          </div>

          <div
            style={{
              background: "rgba(248, 250, 252, 0.8)",
              padding: "16px 18px",
              borderRadius: "18px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Cryptographic Transport
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "6px" }}>
              TLS Handshake Active
            </div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
              Protected against MitM sniffing
            </span>
          </div>
        </div>
      </div>

      {/* Security Architecture Safeguards */}
      <div>
        <div style={{ marginBottom: "16px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--text-muted)",
              display: "block",
              marginBottom: "4px"
            }}
          >
            Defensive Architecture
          </span>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0
            }}
          >
            Zero-Trust Cryptographic Safeguards
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "18px" }}>
          {securityControls.map((sc, idx) => (
            <div
              key={idx}
              className="card-white card-white-hover"
              style={{
                padding: "24px",
                borderRadius: "22px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div
                    style={{
                      width: "42px",
                      height: "42px",
                      borderRadius: "50%",
                      background: "rgba(241, 245, 249, 0.8)",
                      border: "1px solid rgba(226, 232, 240, 0.8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {sc.icon}
                  </div>
                  <span
                    style={{
                      background: "rgba(16, 185, 129, 0.12)",
                      color: "#059669",
                      padding: "3px 10px",
                      borderRadius: "9999px",
                      fontSize: "10.5px",
                      fontWeight: 700,
                      letterSpacing: "0.06em"
                    }}
                  >
                    {sc.status}
                  </span>
                </div>

                <h3
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "15px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: "8px",
                    lineHeight: 1.3
                  }}
                >
                  {sc.title}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                  {sc.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Service Boundary Notice */}
      <div
        className="frosted-panel"
        style={{
          borderRadius: "24px",
          padding: "22px 26px",
          display: "flex",
          gap: "16px",
          alignItems: "flex-start"
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "rgba(79, 70, 229, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <Info size={18} color="#4f46e5" />
        </div>
        <div>
          <strong
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "14.5px",
              fontWeight: 700,
              color: "var(--text-primary)",
              display: "block",
              marginBottom: "4px"
            }}
          >
            Zero-Trust Boundary Assurance
          </strong>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
            In compliance with zero-trust architecture, sensitive security credentials (encryption keys, CSRF secrets, plain passwords, and session identifiers) are never exposed to client-side code, logs, or network payloads.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SecurityActivityPage;
