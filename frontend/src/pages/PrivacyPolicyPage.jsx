import React from "react";
import { Link } from "react-router-dom";
import { Shield, Lock, FileText, ArrowLeft, Info, CheckCircle2, Clock } from "lucide-react";

export function PrivacyPolicyPage() {
  const policyVersion = "v2.4.1";
  const lastUpdated = "October 2026";

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "30px",
                fontWeight: 700,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
                margin: 0
              }}
            >
              Privacy Policy
            </h1>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                background: "rgba(15, 23, 42, 0.08)",
                color: "var(--text-primary)",
                padding: "3px 10px",
                borderRadius: "9999px",
                fontSize: "11px",
                fontWeight: 700
              }}
            >
              {policyVersion}
            </span>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
            Enterprise data handling, document metadata protection, and access audit disclosures • Last updated {lastUpdated}
          </p>
        </div>

        <Link
          to="/settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text-primary)",
            background: "rgba(255, 255, 255, 0.7)",
            backdropFilter: "blur(12px)",
            padding: "8px 16px",
            borderRadius: "9999px",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            textDecoration: "none"
          }}
        >
          <ArrowLeft size={14} />
          <span>Back to Settings</span>
        </Link>
      </div>

      {/* Draft Review Banner */}
      <div
        className="frosted-panel"
        style={{
          padding: "16px 20px",
          borderRadius: "20px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          fontSize: "13px",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
          background: "rgba(245, 158, 11, 0.06)",
          border: "1px solid rgba(245, 158, 11, 0.2)"
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: "rgba(245, 158, 11, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#b45309",
            flexShrink: 0
          }}
        >
          <Info size={16} />
        </div>
        <div>
          <strong style={{ color: "#92400e" }}>Draft Document for Corporate Review:</strong>{" "}
          This policy accurately reflects the technical implementation and access controls of TrustVault Phase 1 & 2. Formal legal guarantees remain subject to corporate counsel ratification.
        </div>
      </div>

      {/* Main Policy Card */}
      <div className="card-white" style={{ padding: "36px", borderRadius: "28px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {/* Section 1 */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f172a"
                }}
              >
                <Lock size={15} />
              </div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                1. Account Credentials & Personal Identity Data
              </h2>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              TrustVault collects only verified corporate email addresses, names, and salted password hashes necessary for authentication. Internal identifiers and passwords are encrypted using one-way bcrypt hashing. Plaintext passwords and email verification OTPs are never stored in browser storage, query parameters, or public system logs.
            </p>
          </section>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)" }} />

          {/* Section 2 */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f172a"
                }}
              >
                <Shield size={15} />
              </div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                2. Document Metadata & AES-256-GCM Envelope Protection
              </h2>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              Uploaded files are transformed into binary TVE1 cryptographic envelopes using AES-256-GCM encryption with unique initialization vectors. Document content remains unreadable in storage without cryptographic access keys. Viewers are granted decryption capability only for documents specifically assigned to their verified account by an Administrator.
            </p>
          </section>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)" }} />

          {/* Section 3 */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f172a"
                }}
              >
                <Clock size={15} />
              </div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                3. Temporary In-Memory Document Access Lifecycle
              </h2>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              To mitigate accidental document leaks on shared or corporate workstations, in-browser decrypted files remain accessible for a maximum duration of five minutes. Upon expiration of the 300-second window, blob object URLs are systematically revoked and memory allocations are cleared from the browser runtime.
            </p>
          </section>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)" }} />

          {/* Section 4 */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "8px",
                  background: "rgba(15, 23, 42, 0.06)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#0f172a"
                }}
              >
                <FileText size={15} />
              </div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                4. Immutable Access Auditing & Activity History
              </h2>
            </div>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              Every document access, download completion, permission update, and authentication event generates an unalterable audit log entry containing timestamps and account identifiers. Users can view their confirmed download history in read-only mode. Audit records cannot be modified or cleared by client accounts.
            </p>
          </section>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)" }} />

          {/* Section 5 */}
          <section>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, marginBottom: "8px", color: "var(--text-primary)" }}>
              5. Inquiries & Data Subject Requests
            </h2>
            <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: 0 }}>
              For questions regarding privacy, security audit logs, or account data management, contact the enterprise security administration team via the{" "}
              <Link to="/help" style={{ color: "var(--text-primary)", fontWeight: 700, textDecoration: "underline" }}>
                Help & Support Portal
              </Link>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
