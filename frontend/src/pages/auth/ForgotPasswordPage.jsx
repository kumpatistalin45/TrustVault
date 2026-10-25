import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiForgotPassword } from "../../services/api";
import { InlineAlert } from "../../components/auth/InlineAlert";
import { Shield, Mail, ArrowLeft, ArrowRight, CheckCircle2, KeyRound } from "lucide-react";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  const validate = () => {
    setEmailError("");
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Corporate email address is required.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid corporate email address.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setError("");

    try {
      await apiForgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch (err) {
      // Enforce anti-enumeration: Always show neutral confirmation unless validation fails
      setSubmitted(true);
    } finally {
      setLoading(false);
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
        background: "var(--bg-gradient)",
        position: "relative"
      }}
    >
      <div
        className="frosted-panel auth-card"
        style={{
          width: "100%",
          maxWidth: "480px",
          padding: "40px",
          borderRadius: "28px",
          background: "rgba(255, 255, 255, 0.75)",
          backdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)"
        }}
      >
        {/* Branding */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "28px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff"
            }}
          >
            <KeyRound size={20} />
          </div>
          <div>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "19px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0
              }}
            >
              TrustVault
            </h1>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              Account Recovery & Reset
            </span>
          </div>
        </div>

        {submitted ? (
          <div>
            <div
              style={{
                padding: "20px",
                borderRadius: "16px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                marginBottom: "24px",
                textAlign: "left"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <CheckCircle2 size={18} color="#059669" />
                <h3 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "#065f46" }}>
                  Instructions Dispatched
                </h3>
              </div>
              <p style={{ fontSize: "13px", color: "#047857", lineHeight: 1.5, margin: 0 }}>
                If an account exists for this email, password reset instructions will be sent.
                Please check your inbox and corporate spam folders for the recovery link.
              </p>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "24px" }}>
              For enterprise security, password reset links expire after 15 minutes and can only be used once.
            </p>

            <Link
              to="/login"
              className="btn-primary"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "14px",
                fontSize: "14px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                textDecoration: "none"
              }}
            >
              <ArrowLeft size={16} />
              <span>Return to Login</span>
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "22px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: "0 0 8px 0"
                }}
              >
                Reset Account Password
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
                Enter your verified corporate email address. We will verify your identity and send a single-use
                cryptographic recovery link.
              </p>
            </div>

            {error && <InlineAlert type="error" message={error} onClose={() => setError("")} />}

            <form onSubmit={handleSubmit} noValidate>
              <div style={{ marginBottom: "24px" }}>
                <label
                  htmlFor="forgot-email"
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    marginBottom: "8px"
                  }}
                >
                  Registered Corporate Email
                </label>
                <div style={{ position: "relative" }}>
                  <Mail
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                  />
                  <input
                    id="forgot-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError("");
                    }}
                    disabled={loading}
                    placeholder="e.g. employee@trustvault.internal"
                    autoComplete="email"
                    style={{
                      width: "100%",
                      padding: "12px 14px 12px 42px",
                      fontSize: "13.5px",
                      background: "rgba(255, 255, 255, 0.85)",
                      border: emailError ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.9)",
                      borderRadius: "14px",
                      color: "var(--text-primary)",
                      outline: "none"
                    }}
                  />
                </div>
                {emailError && (
                  <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "5px" }}>
                    {emailError}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "13px",
                  borderRadius: "16px",
                  fontSize: "14px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  cursor: loading ? "not-allowed" : "pointer",
                  marginBottom: "20px"
                }}
              >
                <span>{loading ? "Sending Recovery Link..." : "Send Reset Instructions"}</span>
                <ArrowRight size={15} />
              </button>

              <div style={{ textAlign: "center" }}>
                <Link
                  to="/login"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "13px",
                    color: "var(--text-secondary)",
                    fontWeight: 600,
                    textDecoration: "none"
                  }}
                >
                  <ArrowLeft size={14} />
                  <span>Back to Sign In</span>
                </Link>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
