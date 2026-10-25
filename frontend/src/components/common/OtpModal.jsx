import React, { useState, useRef, useEffect } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { KeyRound, ShieldAlert, CheckCircle2, RefreshCw } from "lucide-react";

export function OtpModal({
  isOpen,
  onClose,
  documentTitle = "",
  titleText = "A verification key has been sent to your registered email.",
  supportingText = "Enter the code sent to your email to continue.",
  buttonText = "Verify & Unlock",
  onVerify,
  loading = false,
  error = null
}) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [resendCooldown, setResendCooldown] = useState(30);
  const inputRefs = useRef([]);

  // Auto-focus first input when modal opens
  useEffect(() => {
    if (isOpen) {
      setDigits(["", "", "", "", "", ""]);
      setTimeout(() => {
        if (inputRefs.current[0]) {
          inputRefs.current[0].focus();
        }
      }, 100);
    }
  }, [isOpen]);

  // Resend cooldown timer
  useEffect(() => {
    let timer;
    if (isOpen && resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isOpen, resendCooldown]);

  const handleChange = (index, value) => {
    // Only accept numeric input
    const clean = value.replace(/[^0-9]/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }

    const char = clean.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    // Auto-advance to next box
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, 6);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = pasted[i] || "";
    }
    setDigits(next);

    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length === 6 && onVerify) {
      onVerify(code);
    }
  };

  const isComplete = digits.every((d) => d !== "");

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Security Verification" maxWidth="460px">
      <form onSubmit={handleFormSubmit}>
        <div style={{ textAlign: "center", marginBottom: "26px" }}>
          <div
            style={{
              width: "58px",
              height: "58px",
              borderRadius: "50%",
              background: "#0f172a",
              color: "#ffffff",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "14px",
              boxShadow: "0 6px 18px rgba(15, 23, 42, 0.15)"
            }}
          >
            <KeyRound size={26} />
          </div>

          {/* Required Verification Popup Heading */}
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "19px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px",
              lineHeight: 1.3
            }}
          >
            {titleText}
          </h3>

          {/* Required Supporting Text */}
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 auto 8px auto", maxWidth: "360px" }}>
            {supportingText}
          </p>

          {documentTitle && (
            <span
              style={{
                display: "inline-block",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "rgba(15, 23, 42, 0.05)",
                padding: "3px 10px",
                borderRadius: "9999px"
              }}
            >
              Unlock {documentTitle}
            </span>
          )}
        </div>

        {/* 6-Digit PIN Inputs */}
        <div
          className="otp-input-group"
          style={{
            marginBottom: "24px"
          }}
          onPaste={handlePaste}
        >
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => (inputRefs.current[idx] = el)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              className="otp-digit-input"
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              style={{
                fontSize: "22px",
                fontWeight: 700,
                textAlign: "center",
                fontFamily: "var(--font-mono)",
                background: "rgba(248, 250, 252, 0.8)",
                border: "1.5px solid",
                borderColor: error ? "#dc2626" : digit ? "#0f172a" : "rgba(226, 232, 240, 0.9)",
                color: "var(--text-primary)",
                outline: "none",
                transition: "all 0.15s ease",
                boxShadow: digit ? "0 2px 8px rgba(0,0,0,0.06)" : "none"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#0f172a";
                e.target.style.boxShadow = "0 0 0 3px rgba(15, 23, 42, 0.12)";
                e.target.style.background = "#ffffff";
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = "none";
                if (!digit) e.target.style.borderColor = "rgba(226, 232, 240, 0.9)";
              }}
              aria-label={`Digit ${idx + 1}`}
            />
          ))}
        </div>

        {/* Error Feedback */}
        {error && (
          <div
            style={{
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "14px",
              color: "#991b1b",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "20px"
            }}
          >
            <ShieldAlert size={16} color="#dc2626" />
            <span>{error}</span>
          </div>
        )}

        {/* Service Interface Boundary Notice */}
        <div
          className="frosted-panel"
          style={{
            borderRadius: "16px",
            padding: "12px 16px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: 1.45,
            marginBottom: "24px"
          }}
        >
          <strong>Security Service Boundary:</strong> Second-factor passcode validation is enforced before cryptographic decryption envelope parsing. Never share passcodes with unauthorized parties.
        </div>

        {/* Modal Actions */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button
            type="button"
            disabled={resendCooldown > 0}
            onClick={() => setResendCooldown(30)}
            style={{
              background: "transparent",
              border: "none",
              color: resendCooldown > 0 ? "var(--text-muted)" : "#0f172a",
              fontSize: "13px",
              fontWeight: 600,
              cursor: resendCooldown > 0 ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <RefreshCw size={14} />
            <span>{resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}</span>
          </button>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading} style={{ fontSize: "13px", padding: "8px 18px" }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={!isComplete || loading}
              style={{ fontSize: "13px", padding: "8px 22px" }}
            >
              {loading ? "Verifying..." : buttonText}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default OtpModal;
