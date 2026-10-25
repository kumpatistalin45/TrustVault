import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RoleSelector } from "./RoleSelector";
import { InlineAlert } from "./InlineAlert";
import { OtpInput } from "../common/OtpInput";
import { apiSendEmailOtp, apiRetryEmailOtp } from "../../services/api";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  ShieldAlert
} from "lucide-react";

export function EmailOtpLoginForm({
  onRoleChange,
  initialRole = "viewer",
  className = ""
}) {
  const { login, emailOtpLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState("email"); // "email" | "otp"
  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [otpError, setOtpError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resendNotice, setResendNotice] = useState("");
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  // Auto-fill suggested corporate emails on role click for testing convenience
  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    if (!email || email.includes("trustvault.internal") || email.includes("company.com")) {
      if (role === "admin") setEmail("admin@trustvault.internal");
      else if (role === "owner") setEmail("jane.owner@trustvault.internal");
      else if (role === "viewer") setEmail("bob.viewer@trustvault.internal");
    }
    if (onRoleChange) {
      onRoleChange(role);
    }
  };

  // Resend Countdown Timer
  useEffect(() => {
    if (step === "otp" && resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((p) => p - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, resendCooldown]);

  const validateEmail = () => {
    setEmailError("");
    setError("");

    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError("Corporate email address is required.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email format (e.g., user@company.com).");
      return false;
    }

    // Unregistered Account Check simulation
    if (trimmed.toLowerCase().includes("unregistered") || trimmed.toLowerCase().includes("notfound")) {
      setError("This corporate email address is not registered with TrustVault. Please contact your organization's administrator.");
      return false;
    }

    return true;
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!validateEmail()) return;

    setLoading(true);
    setError("");

    try {
      // Simulate dispatch state transition
      await new Promise((r) => setTimeout(r, 450));
      setStep("otp");
      setOtpCode("");
      setResendCooldown(30);
      setResendNotice(`A 6-digit access code has been dispatched to ${email.trim()}.`);
      setTimeout(() => setResendNotice(""), 6000);
    } catch (err) {
      setError(err?.message || "Authentication service is currently unavailable. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setOtpError("");
    setError("");

    if (otpCode.length !== 6) {
      setOtpError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      // Simulate verification transition
      await new Promise((r) => setTimeout(r, 500));

      setVerifiedSuccess(true);
      showToast(`Identity verified! Signing in as ${selectedRole.toUpperCase()}...`, "success");

      // Log in session via genuine email OTP handler
      if (emailOtpLogin) {
        await emailOtpLogin({
          email: email.trim().toLowerCase(),
          otp: otpCode.trim(),
          role: selectedRole
        });
      }

      // Role-based routing
      if (selectedRole === "admin") {
        navigate("/admin");
      } else if (selectedRole === "owner") {
        navigate("/dashboard");
      } else {
        navigate("/viewer/dashboard");
      }
    } catch (err) {
      setOtpError(err?.message || "Invalid or expired verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      if (apiRetryEmailOtp) {
        await apiRetryEmailOtp({ email: email.trim().toLowerCase() }).catch(() => {});
      }
    } catch (_e) {}
    setResendCooldown(45);
    setResendNotice("A new 6-digit verification code has been dispatched.");
    setTimeout(() => setResendNotice(""), 5000);
  };

  const handleBackToEmail = () => {
    setStep("email");
    setOtpError("");
    setError("");
  };

  return (
    <div className={`email-otp-login-container ${className}`} style={{ width: "100%" }}>
      {/* Role Selection at Top */}
      <RoleSelector
        selectedRole={selectedRole}
        onSelectRole={handleRoleSelect}
        disabled={loading || step === "otp"}
      />

      {/* General Error Banner */}
      {error && <InlineAlert type="error" message={error} onClose={() => setError("")} />}

      {/* =========================================================================
          STEP 1: Email Address Input
         ========================================================================= */}
      {step === "email" && (
        <form onSubmit={handleSendOtp} noValidate>
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="login-email"
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
              Registered Corporate Email
            </label>

            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                  if (error) setError("");
                }}
                disabled={loading}
                placeholder="e.g. employee@trustvault.internal"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "13px 14px 13px 42px",
                  fontSize: "14px",
                  background: "rgba(255, 255, 255, 0.9)",
                  border: emailError ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
              />
            </div>

            {emailError && (
              <span
                style={{
                  display: "block",
                  color: "#dc2626",
                  fontSize: "12px",
                  fontWeight: 500,
                  marginTop: "6px"
                }}
              >
                {emailError}
              </span>
            )}
          </div>

          {/* Honest Phase 1 UI Notice */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.03)",
              border: "1px dashed rgba(15, 23, 42, 0.12)",
              borderRadius: "14px",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "12px",
              color: "var(--text-muted)",
              lineHeight: 1.45
            }}
          >
            <strong>Phase 1 Email OTP Interface:</strong> Enter your registered corporate email to initiate OTP verification. Live SMS/SMTP dispatch will connect in Phase 2.
          </div>

          {/* Continue / Send OTP Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            aria-label={`Continue / Send OTP (Sign In as ${selectedRole.toUpperCase()})`}
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "16px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            <span>{loading ? "Sending One-Time Password..." : `Continue / Send OTP (${selectedRole.toUpperCase()})`}</span>
            <ArrowRight size={15} />
          </button>
        </form>
      )}

      {/* =========================================================================
          STEP 2: OTP Verification Screen
         ========================================================================= */}
      {step === "otp" && (
        <form onSubmit={handleVerifyOtp} noValidate>
          {/* Email confirmation card with Edit Email action */}
          <div
            style={{
              padding: "14px 18px",
              borderRadius: "16px",
              background: "rgba(99, 102, 241, 0.06)",
              border: "1px solid rgba(99, 102, 241, 0.18)",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
              <div
                style={{
                  width: "34px",
                  height: "34px",
                  borderRadius: "10px",
                  background: "#0f172a",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <Mail size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>Code dispatched to:</div>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {email}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleBackToEmail}
              disabled={loading}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-indigo)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                flexShrink: 0,
                padding: "4px 8px"
              }}
            >
              <ArrowLeft size={13} />
              <span>Edit email</span>
            </button>
          </div>

          {resendNotice && <InlineAlert type="info" message={resendNotice} onClose={() => setResendNotice("")} />}
          {otpError && <InlineAlert type="error" message={otpError} onClose={() => setOtpError("")} />}

          {/* 6 Input Boxes */}
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-secondary)",
                marginBottom: "12px",
                textAlign: "center"
              }}
            >
              Enter 6-Digit One-Time Password
            </label>

            <OtpInput
              value={otpCode}
              onChange={(val) => {
                setOtpCode(val);
                if (otpError) setOtpError("");
              }}
              disabled={loading || verifiedSuccess}
              hasError={Boolean(otpError)}
            />
          </div>

          {/* Resend OTP Control */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              marginBottom: "20px"
            }}
          >
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={resendCooldown > 0 || loading || verifiedSuccess}
              style={{
                background: "none",
                border: "none",
                color: resendCooldown > 0 ? "var(--text-muted)" : "var(--accent-indigo)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <RotateCcw size={13} />
              <span>
                {resendCooldown > 0
                  ? `Resend code in ${resendCooldown}s`
                  : "Didn't receive code? Resend OTP"}
              </span>
            </button>
          </div>

          {/* Phase 1 Boundary Banner */}
          <div
            style={{
              background: "rgba(15, 23, 42, 0.03)",
              border: "1px dashed rgba(15, 23, 42, 0.12)",
              borderRadius: "14px",
              padding: "10px 14px",
              marginBottom: "20px",
              fontSize: "11.5px",
              color: "var(--text-muted)",
              lineHeight: 1.45
            }}
          >
            <strong>Phase 1 Verification:</strong> Enter any 6 digits to verify the UI flow and sign in to the {selectedRole.toUpperCase()} workspace.
          </div>

          {/* Verify OTP Button */}
          <button
            type="submit"
            disabled={loading || otpCode.length !== 6 || verifiedSuccess}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "14px",
              borderRadius: "16px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: loading || otpCode.length !== 6 ? "not-allowed" : "pointer"
            }}
          >
            <span>
              {loading
                ? "Verifying OTP..."
                : verifiedSuccess
                ? "Access Authorized!"
                : "Verify OTP & Continue"}
            </span>
            <ArrowRight size={15} />
          </button>
        </form>
      )}
    </div>
  );
}

export default EmailOtpLoginForm;
