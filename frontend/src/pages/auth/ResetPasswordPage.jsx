import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiValidateResetToken, apiResetPassword } from "../../services/api";
import { InlineAlert } from "../../components/auth/InlineAlert";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  KeyRound
} from "lucide-react";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState("");
  const [associatedEmail, setAssociatedEmail] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState("");
  const [clientError, setClientError] = useState("");
  const [success, setSuccess] = useState(false);

  // Criteria
  const hasMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const isFormValid =
    hasMinLength &&
    hasUppercase &&
    hasLowercase &&
    hasNumber &&
    hasSpecial &&
    passwordsMatch;

  useEffect(() => {
    async function checkToken() {
      if (!token) {
        setTokenValid(false);
        setTokenError("No password reset token was provided in the recovery URL.");
        setValidating(false);
        return;
      }

      setValidating(true);
      try {
        const res = await apiValidateResetToken(token);
        if (res.valid) {
          setTokenValid(true);
          setAssociatedEmail(res.email || "");
        } else {
          setTokenValid(false);
          setTokenError(res.error || "The reset link is invalid, expired, or has already been used.");
        }
      } catch (err) {
        setTokenValid(false);
        setTokenError(err.message || "Failed to validate reset link.");
      } finally {
        setValidating(false);
      }
    }
    checkToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setClientError("");
    setServerError("");

    if (!isFormValid) {
      setClientError("Please ensure the new password fulfills all enterprise security criteria.");
      return;
    }

    setLoading(true);
    try {
      const res = await apiResetPassword({ token, newPassword: password });
      if (res.success) {
        setSuccess(true);
      } else {
        setServerError(res.error || "Could not complete password reset.");
      }
    } catch (err) {
      setServerError(err.message || "Password update failed. Token may have expired.");
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
        className="frosted-panel"
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
        {/* Branding Header */}
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
              Enterprise Password Reset
            </span>
          </div>
        </div>

        {validating ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Validating recovery link token...
            </span>
          </div>
        ) : !tokenValid ? (
          <div>
            <div
              style={{
                padding: "20px",
                borderRadius: "16px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                marginBottom: "24px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <XCircle size={18} color="#dc2626" />
                <h3 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "#991b1b" }}>
                  Invalid or Expired Link
                </h3>
              </div>
              <p style={{ fontSize: "13px", color: "#b91c1c", lineHeight: 1.5, margin: 0 }}>
                {tokenError}
              </p>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "24px" }}>
              Password reset links can only be used once and expire after 15 minutes to safeguard your account against unauthorized access.
            </p>

            <Link
              to="/forgot-password"
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
              <span>Request New Reset Link</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : success ? (
          <div>
            <div
              style={{
                padding: "20px",
                borderRadius: "16px",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                marginBottom: "24px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <CheckCircle2 size={18} color="#059669" />
                <h3 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "#065f46" }}>
                  Password Changed Successfully
                </h3>
              </div>
              <p style={{ fontSize: "13px", color: "#047857", lineHeight: 1.5, margin: 0 }}>
                Your enterprise credentials have been updated and previous sessions have been securely rotated.
                You can now log in using your new password.
              </p>
            </div>

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
              <span>Proceed to Sign In</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: "20px" }}>
              <h2
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "20px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: "0 0 6px 0"
                }}
              >
                Set New Enterprise Password
              </h2>
              {associatedEmail && (
                <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: 0 }}>
                  Resetting credentials for: <strong>{associatedEmail}</strong>
                </p>
              )}
            </div>

            {(clientError || serverError) && (
              <InlineAlert
                type="error"
                message={clientError || serverError}
                onClose={() => {
                  setClientError("");
                  setServerError("");
                }}
              />
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* New Password */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="reset-new-password"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    marginBottom: "8px"
                  }}
                >
                  New Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                  />
                  <input
                    id="reset-new-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Min. 12 characters, mix of characters"
                    style={{
                      width: "100%",
                      padding: "12px 42px",
                      fontSize: "13.5px",
                      background: "rgba(255, 255, 255, 0.85)",
                      border: "1px solid rgba(203, 213, 225, 0.9)",
                      borderRadius: "14px",
                      color: "var(--text-primary)",
                      outline: "none"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px"
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div style={{ marginBottom: "18px" }}>
                <label
                  htmlFor="reset-confirm-password"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-secondary)",
                    marginBottom: "8px"
                  }}
                >
                  Confirm New Password
                </label>
                <div style={{ position: "relative" }}>
                  <Lock
                    size={16}
                    color="var(--text-muted)"
                    style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                  />
                  <input
                    id="reset-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    placeholder="Re-enter your new password"
                    style={{
                      width: "100%",
                      padding: "12px 42px",
                      fontSize: "13.5px",
                      background: "rgba(255, 255, 255, 0.85)",
                      border:
                        confirmPassword.length > 0 && !passwordsMatch
                          ? "1.5px solid #ef4444"
                          : "1px solid rgba(203, 213, 225, 0.9)",
                      borderRadius: "14px",
                      color: "var(--text-primary)",
                      outline: "none"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "4px"
                    }}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Requirements Checklist */}
              <div
                style={{
                  padding: "14px",
                  borderRadius: "14px",
                  background: "rgba(255, 255, 255, 0.65)",
                  border: "1px solid rgba(226, 232, 240, 0.9)",
                  marginBottom: "20px"
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "var(--text-muted)",
                    marginBottom: "8px"
                  }}
                >
                  Password Requirements
                </span>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "11.5px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: hasMinLength ? "#059669" : "var(--text-muted)" }}>
                    {hasMinLength ? <CheckCircle2 size={13} color="#059669" /> : <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1px solid #cbd5e1" }} />}
                    <span>At least 12 chars</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: hasUppercase && hasLowercase ? "#059669" : "var(--text-muted)" }}>
                    {hasUppercase && hasLowercase ? <CheckCircle2 size={13} color="#059669" /> : <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1px solid #cbd5e1" }} />}
                    <span>Upper & lowercase</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: hasNumber && hasSpecial ? "#059669" : "var(--text-muted)" }}>
                    {hasNumber && hasSpecial ? <CheckCircle2 size={13} color="#059669" /> : <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1px solid #cbd5e1" }} />}
                    <span>Number & symbol</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: passwordsMatch ? "#059669" : "var(--text-muted)" }}>
                    {passwordsMatch ? <CheckCircle2 size={13} color="#059669" /> : <div style={{ width: "13px", height: "13px", borderRadius: "50%", border: "1px solid #cbd5e1" }} />}
                    <span>Passwords match</span>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!isFormValid || loading}
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
                  cursor: !isFormValid || loading ? "not-allowed" : "pointer"
                }}
              >
                <ShieldCheck size={16} />
                <span>{loading ? "Updating Credentials..." : "Update Password"}</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordPage;
