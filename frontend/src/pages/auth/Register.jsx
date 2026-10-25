import React from "react";
import { RegistrationForm } from "../../components/auth/RegistrationForm";
import { Shield, CheckCircle2, Lock, FileCheck2, UserCheck } from "lucide-react";

export function Register() {
  return (
    <div className="auth-page-container">
      <div className="auth-grid-container" style={{ maxWidth: "1080px" }}>
        {/* Left Pane: Enterprise Enrollment Greeting */}
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
                  Enterprise Account Registration
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
              Enterprise Identity Registration
            </h2>

            <p
              style={{
                fontSize: "14.5px",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                marginBottom: "32px"
              }}
            >
              Complete your 3-step registration to enroll in TrustVault. Access permissions will be governed by your selected organizational role.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <UserCheck size={15} color="#0f172a" />
                </div>
                <div>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                    1. Account & Role Selection
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Select your access role (Owner or Viewer) and enter verified contact information.
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <FileCheck2 size={15} color="#0f172a" />
                </div>
                <div>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                    2. Email Verification Check
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Confirm corporate domain ownership via a 6-digit access code.
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <Lock size={15} color="#0f172a" />
                </div>
                <div>
                  <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                    3. Secure Credential Creation
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    Establish an enterprise-grade password meeting all complexity criteria.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Pane: Multi-Step Registration Form Card */}
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
              Create Your Account
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
              Complete the steps below to register your identity.
            </p>
          </div>

          <RegistrationForm />
        </div>
      </div>
    </div>
  );
}

export default Register;
