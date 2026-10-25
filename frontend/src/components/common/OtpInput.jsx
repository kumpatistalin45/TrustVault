import React, { useRef, useEffect } from "react";

export function OtpInput({
  value = "",
  onChange,
  length = 6,
  disabled = false,
  hasError = false,
  autoFocus = true
}) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] || "");

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, [autoFocus]);

  const handleDigitChange = (index, char) => {
    const clean = char.replace(/[^0-9]/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[index] = clean;
    const combined = newDigits.join("");
    onChange(combined);

    if (clean && index < length - 1 && inputRefs.current[index + 1]) {
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
    const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "").slice(0, length);
    if (!pasted) return;

    onChange(pasted);
    const targetIdx = Math.min(pasted.length, length - 1);
    if (inputRefs.current[targetIdx]) {
      inputRefs.current[targetIdx].focus();
    }
  };

  return (
    <div
      className="otp-input-group"
      onPaste={handlePaste}
      style={{
        display: "flex",
        gap: "10px",
        justifyContent: "center",
        margin: "0 auto",
        maxWidth: "380px"
      }}
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
          disabled={disabled}
          onChange={(e) => handleDigitChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          aria-label={`Verification digit ${idx + 1}`}
          style={{
            width: "48px",
            height: "54px",
            textAlign: "center",
            fontFamily: "var(--font-mono)",
            fontSize: "22px",
            fontWeight: 800,
            borderRadius: "14px",
            border: hasError
              ? "2px solid #ef4444"
              : digit
              ? "2px solid #0f172a"
              : "1.5px solid rgba(203, 213, 225, 0.9)",
            background: "rgba(255, 255, 255, 0.95)",
            color: "var(--text-primary)",
            outline: "none",
            boxShadow: digit ? "0 4px 14px rgba(15, 23, 42, 0.08)" : "none",
            transition: "all 0.15s ease"
          }}
          onFocus={(e) => {
            if (!hasError) {
              e.target.style.borderColor = "#6366f1";
              e.target.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.2)";
            }
          }}
          onBlur={(e) => {
            if (!hasError) {
              e.target.style.borderColor = digit ? "#0f172a" : "rgba(203, 213, 225, 0.9)";
              e.target.style.boxShadow = digit ? "0 4px 14px rgba(15, 23, 42, 0.08)" : "none";
            }
          }}
        />
      ))}
    </div>
  );
}

export default OtpInput;
