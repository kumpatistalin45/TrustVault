import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { CURRENT_TERMS_VERSION } from "../services/api";
import { InlineAlert } from "../components/auth/InlineAlert";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  Lock,
  LogOut,
  AlertTriangle,
  ArrowRight,
  Info
} from "lucide-react";

export function TermsPage() {
  const { user, hasAcceptedTerms, acceptTerms, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const policyVersion = `v${CURRENT_TERMS_VERSION}`;
  const lastUpdated = "October 2026";

  const handleAccept = async (e) => {
    e.preventDefault();
    if (!agreed || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      await acceptTerms();
      showToast("Terms & Conditions accepted. Access granted to TrustVault.", "success");
      navigate("/");
    } catch (err) {
      setError(
        err?.message ||
        "Failed to record legal acceptance with authorization server. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async () => {
    try {
      await logout();
      navigate("/");
    } catch (_e) {
      navigate("/");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        background: "var(--bg-gradient)"
      }}
      className="animate-fade-in"
    >
      <div
        className="card-white auth-card"
        style={{
          width: "100%",
          maxWidth: "800px",
          padding: "40px",
          borderRadius: "32px",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)"
        }}
      >
        {/* Header with Title and Policy Version */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "24px"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "12px",
                  background: "#0f172a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "24px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                  letterSpacing: "-0.02em"
                }}
              >
                Terms & Conditions of Service
              </h1>
            </div>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
              Mandatory Enterprise Data Access Agreement for all authenticated accounts.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11.5px",
                fontWeight: 600,
                background: "rgba(15, 23, 42, 0.08)",
                color: "var(--text-primary)",
                padding: "3px 10px",
                borderRadius: "9999px"
              }}
            >
              Policy {policyVersion}
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Effective: {lastUpdated}
            </span>
          </div>
        </div>

        {/* Status Indicator if Already Accepted */}
        {hasAcceptedTerms && (
          <div
            className="frosted-panel"
            style={{
              padding: "12px 18px",
              borderRadius: "16px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#065f46"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={16} color="#059669" />
              <span>You have already accepted policy version {policyVersion}. You may re-review the agreement below.</span>
            </div>
            <Link
              to="/"
              style={{
                color: "#0f172a",
                fontWeight: 700,
                textDecoration: "underline",
                fontSize: "12.5px"
              }}
            >
              Back to Documents
            </Link>
          </div>
        )}

        {/* Scrollable Terms Content Area */}
        <div
          style={{
            maxHeight: "360px",
            overflowY: "auto",
            padding: "24px",
            borderRadius: "20px",
            background: "rgba(248, 250, 252, 0.8)",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            fontSize: "13.5px",
            color: "var(--text-secondary)",
            lineHeight: 1.65,
            marginBottom: "24px"
          }}
        >
          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            1. Scope of Authorized Access
          </h3>
          <p style={{ marginBottom: "16px" }}>
            TrustVault provides authorized enterprise personnel with role-restricted access to confidential documents. Users classified under Viewer status are strictly restricted to decrypting and inspecting files specifically assigned to their verified account by an authorized Administrator. You agree not to attempt to circumvent authorization boundaries or access documents belonging to other personnel.
          </p>

          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            2. Single-Device Session Policy
          </h3>
          <p style={{ marginBottom: "16px" }}>
            In accordance with enterprise zero-trust controls, each employee account is bound to a single active workstation or browser session. Concurrent logins from multiple devices or locations will automatically invalidate prior sessions to prevent credential hijacking. You agree to safeguard your credentials and report any unexpected sign-ins immediately.
          </p>

          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            3. Temporary Document Access & Key Lifecycles
          </h3>
          <p style={{ marginBottom: "16px" }}>
            Decrypted files provided within the TrustVault application are subject to a strict 5-minute temporary access lifecycle. After five minutes, browser memory buffers and temporary object URLs are automatically revoked. Employees are prohibited from deploying automated screen-scrapers, memory dumps, or reverse-engineering tools against decrypted content.
          </p>

          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            4. Immutable Audit Records
          </h3>
          <p style={{ marginBottom: "16px" }}>
            Every document unlock, download event, permission check, and session authentication is indelibly recorded in the TrustVault audit trail. Employees may review their own download history in read-only mode, but audit logs cannot be edited, altered, or deleted by users.
          </p>

          <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
            5. Revocation of Privileges
          </h3>
          <p style={{ margin: 0 }}>
            Enterprise Administrators retain the legal and operational authority to revoke document access, terminate account sessions, or adjust security classifications at any time without prior notice.
          </p>
        </div>

        {/* Inline Red Error on Submission Failure */}
        {error && (
          <InlineAlert
            type="error"
            message={error}
            onClose={() => setError("")}
          />
        )}

        {/* Agreement Form */}
        <form onSubmit={handleAccept}>
          {/* Checkbox */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "12px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: agreed ? "rgba(99, 102, 241, 0.06)" : "transparent",
              border: agreed ? "1px solid rgba(99, 102, 241, 0.25)" : "1px solid rgba(226, 232, 240, 0.8)",
              marginBottom: "24px",
              transition: "all 0.15s ease",
              cursor: "pointer"
            }}
            onClick={() => setAgreed(!agreed)}
          >
            <input
              type="checkbox"
              id="terms-agreement-checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{
                marginTop: "3px",
                width: "18px",
                height: "18px",
                accentColor: "#0f172a",
                cursor: "pointer"
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <label
              htmlFor="terms-agreement-checkbox"
              style={{
                fontSize: "13.5px",
                fontWeight: 600,
                color: "var(--text-primary)",
                lineHeight: 1.45,
                cursor: "pointer",
                userSelect: "none"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              I have read and agree to the Terms & Conditions of TrustVault
            </label>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "14px"
            }}
          >
            <button
              type="button"
              onClick={handleDecline}
              disabled={submitting}
              className="btn-secondary"
              style={{
                padding: "11px 20px",
                borderRadius: "9999px",
                fontSize: "13px",
                display: "inline-flex",
                alignItems: "center",
                gap: "7px"
              }}
            >
              <LogOut size={14} />
              <span>Decline & Sign Out</span>
            </button>

            <button
              type="submit"
              disabled={!agreed || submitting}
              className="btn-primary"
              style={{
                padding: "12px 28px",
                borderRadius: "9999px",
                fontSize: "13.5px",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                cursor: !agreed || submitting ? "not-allowed" : "pointer",
                opacity: !agreed || submitting ? 0.6 : 1
              }}
            >
              <span>{submitting ? "Confirming Acceptance..." : "Accept & Continue"}</span>
              <ArrowRight size={15} />
            </button>
          </div>
        </form>

        {/* Legal Disclaimer */}
        <p
          style={{
            fontSize: "11.5px",
            color: "var(--text-muted)",
            marginTop: "20px",
            marginBottom: 0,
            lineHeight: 1.4,
            textAlign: "center"
          }}
        >
          Notice: Access to TrustVault protected documents requires confirmed acceptance of policy {policyVersion}. Declining will terminate your authenticated session.
        </p>
      </div>
    </div>
  );
}

export default TermsPage;
