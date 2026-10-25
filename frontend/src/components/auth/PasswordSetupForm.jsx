import React, { useState } from "react";
import { Lock, Eye, EyeOff, CheckCircle2, XCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { InlineAlert } from "./InlineAlert";

export function PasswordSetupForm({
  onSubmit,
  onBack,
  loading = false,
  error = "",
  disabled = false
}) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [clientError, setClientError] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Real-time validation criteria
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

  const handleSubmit = (e) => {
    e.preventDefault();
    setClientError("");

    if (!hasMinLength) {
      setClientError("Password must be at least 12 characters in length.");
      return;
    }
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      setClientError("Password must meet all complexity requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setClientError("Passwords do not match. Please ensure both fields are identical.");
      return;
    }
    if (!acceptedTerms) {
      setClientError("You must explicitly review and agree to the Terms & Conditions before completing registration.");
      return;
    }

    if (onSubmit) {
      onSubmit({ password, confirmPassword, acceptedTerms: true });
    }
  };

  const activeError = clientError || error;

  return (
    <form onSubmit={handleSubmit} className="password-setup-form" style={{ width: "100%" }}>
      {/* Red inline validation error */}
      {activeError && <InlineAlert type="error" message={activeError} onClose={() => setClientError("")} />}

      {/* Create Password Input */}
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="setup-password"
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
          Create Enterprise Password
        </label>
        <div style={{ position: "relative" }}>
          <Lock
            size={16}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            id="setup-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setClientError("");
            }}
            disabled={disabled || loading}
            placeholder="Min. 12 characters, mix of characters"
            style={{
              width: "100%",
              padding: "12px 42px 12px 42px",
              fontSize: "13.5px",
              background: "rgba(255, 255, 255, 0.8)",
              border: "1px solid rgba(203, 213, 225, 0.8)",
              borderRadius: "14px",
              color: "var(--text-primary)",
              outline: "none",
              transition: "all 0.15s ease"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#6366f1";
              e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.2)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(203, 213, 225, 0.8)";
              e.target.style.boxShadow = "none";
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

      {/* Confirm Password Input */}
      <div style={{ marginBottom: "16px" }}>
        <label
          htmlFor="setup-confirm-password"
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
          Confirm Password
        </label>
        <div style={{ position: "relative" }}>
          <Lock
            size={16}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            id="setup-confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setClientError("");
            }}
            disabled={disabled || loading}
            placeholder="Re-enter your password"
            style={{
              width: "100%",
              padding: "12px 42px 12px 42px",
              fontSize: "13.5px",
              background: "rgba(255, 255, 255, 0.8)",
              border:
                confirmPassword.length > 0 && !passwordsMatch
                  ? "1px solid #ef4444"
                  : "1px solid rgba(203, 213, 225, 0.8)",
              borderRadius: "14px",
              color: "var(--text-primary)",
              outline: "none",
              transition: "all 0.15s ease"
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "#6366f1";
              e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.2)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor =
                confirmPassword.length > 0 && !passwordsMatch ? "#ef4444" : "rgba(203, 213, 225, 0.8)";
              e.target.style.boxShadow = "none";
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

      {/* Password Strength and Validation Checklist */}
      <div
        className="frosted-panel"
        style={{
          padding: "14px 16px",
          borderRadius: "16px",
          marginBottom: "24px",
          background: "rgba(255, 255, 255, 0.65)"
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", fontSize: "12px" }}>
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

      {/* Mandatory Terms & Conditions acceptance during signup */}
      <div
        style={{
          marginBottom: "20px",
          padding: "12px 14px",
          borderRadius: "14px",
          background: "rgba(255, 255, 255, 0.75)",
          border: "1px solid rgba(226, 232, 240, 0.9)"
        }}
      >
        <label
          htmlFor="signup-terms-agreement"
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            fontSize: "12px",
            color: "var(--text-primary)",
            cursor: "pointer",
            lineHeight: 1.45
          }}
        >
          <input
            id="signup-terms-agreement"
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            style={{
              marginTop: "2px",
              width: "16px",
              height: "16px",
              accentColor: "#0f172a",
              cursor: "pointer"
            }}
          />
          <span>
            I have read and agree to the{" "}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 600, color: "#6366f1", textDecoration: "underline" }}
            >
              Terms & Conditions (v1.0)
            </a>{" "}
            and acknowledge the{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontWeight: 600, color: "#6366f1", textDecoration: "underline" }}
            >
              Privacy Policy
            </a>
            .
          </span>
        </label>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="btn-secondary"
          style={{
            padding: "12px 18px",
            borderRadius: "16px",
            fontSize: "13.5px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px"
          }}
        >
          <ArrowLeft size={14} />
          <span>Back</span>
        </button>

        <button
          type="submit"
          disabled={!isFormValid || !acceptedTerms || loading || disabled}
          className="btn-primary"
          style={{
            flex: 1,
            padding: "13px",
            borderRadius: "16px",
            fontSize: "14px",
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            cursor: !isFormValid || !acceptedTerms || loading || disabled ? "not-allowed" : "pointer"
          }}
        >
          <ShieldCheck size={16} />
          <span>{loading ? "Completing Registration..." : "Complete Registration"}</span>
        </button>
      </div>
    </form>
  );
}

export default PasswordSetupForm;
