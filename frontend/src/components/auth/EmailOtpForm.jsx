import React, { useState, useEffect, useRef } from "react";
import { Mail, CheckCircle2, RotateCcw, ArrowLeft, ArrowRight, ShieldAlert, KeyRound } from "lucide-react";
import { InlineAlert } from "./InlineAlert";

export function EmailOtpForm({
  email,
  onVerifySuccess,
  onBack,
  disabled = false
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);
  const [resendNotice, setResendNotice] = useState("");
  const inputRefs = useRef([]);

  useEffect(() => {
    // Focus first input on mount
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleDigitChange = (index, value) => {
    // Allow only single numeric characters
    const cleanVal = value.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = cleanVal;
    setDigits(newDigits);
    setError("");

    if (cleanVal && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || "";
    }
    setDigits(newDigits);
    setError("");

    const targetIndex = Math.min(pasted.length, 5);
    if (inputRefs.current[targetIndex]) {
      inputRefs.current[targetIndex].focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");

    const fullCode = digits.join("");
    if (fullCode.length !== 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setLoading(true);
    try {
      if (onVerifySuccess) {
        onVerifySuccess(fullCode);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (resendCooldown > 0) return;
    setResendCooldown(45);
    setResendNotice("A new verification code has been requested for your email.");
    setTimeout(() => setResendNotice(""), 6000);
  };

  return (
    <form onSubmit={handleVerify} className="email-otp-form" style={{ width: "100%" }}>
      {/* Required verification message banner */}
      <div
        className="frosted-panel"
        style={{
          padding: "16px 20px",
          borderRadius: "20px",
          background: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(99, 102, 241, 0.18)",
          marginBottom: "20px"
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
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
          <div>
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "14.5px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 4px 0"
              }}
            >
              A verification code has been sent to your email.
            </h4>
            <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0 }}>
              Sent to <strong style={{ color: "var(--text-primary)" }}>{email || "your registered address"}</strong>. Enter the 6-digit access code below.
            </p>
          </div>
        </div>
      </div>

      {/* Red inline validation error */}
      {error && <InlineAlert type="error" message={error} onClose={() => setError("")} />}

      {/* Resend notice */}
      {resendNotice && <InlineAlert type="info" message={resendNotice} onClose={() => setResendNotice("")} />}

      {/* 6-Digit OTP Inputs */}
      <div style={{ marginBottom: "24px" }}>
        <label
          htmlFor="otp-digit-0"
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
            marginBottom: "10px",
            textAlign: "center"
          }}
        >
          Enter 6-Digit Verification Code
        </label>

        <div
          className="otp-input-group"
          onPaste={handlePaste}
        >
          {digits.map((digit, idx) => (
            <input
              key={idx}
              id={`otp-digit-${idx}`}
              ref={(el) => (inputRefs.current[idx] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              disabled={disabled || loading}
              className="otp-digit-input"
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              aria-label={`Digit ${idx + 1}`}
              style={{
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--text-primary)",
                background: "rgba(255, 255, 255, 0.9)",
                border: error
                  ? "2px solid #ef4444"
                  : digit
                  ? "2px solid #0f172a"
                  : "1px solid rgba(203, 213, 225, 0.8)",
                outline: "none",
                boxShadow: digit
                  ? "0 4px 12px rgba(15, 23, 42, 0.08)"
                  : "0 2px 4px rgba(15, 23, 42, 0.02)",
                transition: "all 0.15s ease"
              }}
              onFocus={(e) => {
                if (!error) {
                  e.target.style.borderColor = "#6366f1";
                  e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.2)";
                }
              }}
              onBlur={(e) => {
                if (!error) {
                  e.target.style.borderColor = digit ? "#0f172a" : "rgba(203, 213, 225, 0.8)";
                  e.target.style.boxShadow = digit ? "0 4px 12px rgba(15, 23, 42, 0.08)" : "none";
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Resend control */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "24px",
          padding: "0 4px"
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-secondary)",
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: 0
          }}
        >
          <ArrowLeft size={13} />
          <span>Edit email</span>
        </button>

        <button
          type="button"
          onClick={handleResend}
          disabled={resendCooldown > 0 || disabled || loading}
          style={{
            background: "none",
            border: "none",
            color: resendCooldown > 0 ? "var(--text-muted)" : "var(--accent-indigo)",
            fontSize: "12.5px",
            fontWeight: 600,
            cursor: resendCooldown > 0 ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: 0
          }}
        >
          <RotateCcw size={13} />
          <span>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}</span>
        </button>
      </div>

      {/* Honest Boundary Notice */}
      <div
        style={{
          background: "rgba(15, 23, 42, 0.04)",
          border: "1px dashed rgba(15, 23, 42, 0.12)",
          borderRadius: "14px",
          padding: "10px 14px",
          marginBottom: "20px",
          fontSize: "11.5px",
          color: "var(--text-muted)",
          lineHeight: 1.4
        }}
      >
        <strong>Phase 1 UI Notice:</strong> Input validation is active. Live server-side OTP dispatch and token issuance will be bound in Phase 2. You may enter any 6 digits to verify the UI flow.
      </div>

      {/* Verify & Continue Button */}
      <button
        type="submit"
        disabled={loading || disabled || digits.join("").length !== 6}
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
          cursor: loading || disabled || digits.join("").length !== 6 ? "not-allowed" : "pointer"
        }}
      >
        <span>{loading ? "Verifying..." : "Verify Code & Continue"}</span>
        <ArrowRight size={15} />
      </button>
    </form>
  );
}

export default EmailOtpForm;
