import React, { useState } from "react";
import { LoginForm } from "../../components/auth/LoginForm";
import { SessionReplacedNotice } from "../../components/session/SessionReplacedNotice";
import { SessionExpiredNotice } from "../../components/session/SessionExpiredNotice";
import { Shield, Lock, Eye, CheckCircle2, AlertTriangle, Monitor } from "lucide-react";

export function Login() {
  const [activeRole, setActiveRole] = useState("viewer");
  const [previewSessionMode, setPreviewSessionMode] = useState("normal"); // "normal" | "replaced" | "expired"

  return (
    <div className="auth-page-container">
      <div
        className="auth-grid-container"
        style={{
          gridTemplateColumns: previewSessionMode === "normal" ? undefined : "1fr"
        }}
      >
        {/* Left Pane: Enterprise Branding & Trust Indicators (Only shown in normal mode) */}
        {previewSessionMode === "normal" && (
          <div
            className="frosted-panel auth-left-pane"
            style={{
              padding: "48px 40px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              borderRadius: "32px"
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "36px" }}>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "14px",
                    background: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    boxShadow: "0 8px 20px rgba(15, 23, 42, 0.2)"
                  }}
                >
                  <Shield size={22} />
                </div>
                <div>
                  <span
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      letterSpacing: "-0.02em",
                      display: "block"
                    }}
                  >
                    TrustVault
                  </span>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontWeight: 500 }}>
                    Enterprise Document Security
                  </span>
                </div>
              </div>

              <h2
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "28px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  lineHeight: 1.25,
                  letterSpacing: "-0.02em",
                  marginBottom: "16px"
                }}
              >
                Zero-Trust Document Access Portal
              </h2>

              <p
                style={{
                  fontSize: "14.5px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.6,
                  marginBottom: "32px"
                }}
              >
                Access and manage encrypted documents through verified enterprise credentials, end-to-end auditability, and single-device session protection.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-primary)" }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>Strict role-based access for Admins, Owners, and Viewers</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-primary)" }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>Single-device session enforcement with automated revocation</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-primary)" }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>Confidential client-side decryption & in-memory key lifecycles</span>
                </div>
              </div>
            </div>

            {/* Phase 1 Status Banner */}
            <div
              style={{
                marginTop: "36px",
                background: "rgba(15, 23, 42, 0.04)",
                borderRadius: "16px",
                padding: "14px 18px",
                fontSize: "12px",
                color: "var(--text-muted)",
                lineHeight: 1.45
              }}
            >
              <strong>Firebase Passwordless Auth:</strong> Owner and Viewer accounts authenticate via a secure email sign-in link. Admin accounts use username &amp; password.
            </div>
          </div>
        )}

        {/* Right Pane: Authentication or Session State Preview */}
        <div
          className="card-white auth-card"
          style={{
            padding: "44px 36px",
            borderRadius: "32px",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.08)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center"
          }}
        >
          {/* Header Title */}
          <div style={{ marginBottom: "20px" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "26px",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                margin: "0 0 6px 0"
              }}
            >
              Sign In to TrustVault
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
              Select your access role and sign in with your corporate email.
            </p>
          </div>

          {/* Render Active View State */}
          {previewSessionMode === "normal" && (
            <LoginForm
              initialRole={activeRole}
              onRoleChange={(r) => setActiveRole(r)}
            />
          )}

          {previewSessionMode === "replaced" && (
            <SessionReplacedNotice
              role={activeRole}
              onReauthenticate={() => setPreviewSessionMode("normal")}
            />
          )}

          {previewSessionMode === "expired" && (
            <SessionExpiredNotice
              role={activeRole}
              onLoginAgain={() => setPreviewSessionMode("normal")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;
