import React from "react";

/**
 * Standard Accessible Horizontal Toggle Switch
 * Features:
 * - Fixed 44x24px dimensions with flex-shrink: 0 to eliminate distortion on small screens
 * - 18px circular white thumb with smooth horizontal sliding (left: 3px -> 23px)
 * - WAI-ARIA role="switch" and aria-checked support
 * - Clean focus rings and accessible touch target
 */
export function ToggleSwitch({
  checked = false,
  onChange,
  disabled = false,
  id,
  name,
  ariaLabel = "Toggle setting",
  className = ""
}) {
  const handleClick = (e) => {
    e.preventDefault();
    if (disabled) return;
    if (onChange) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (onChange) {
        onChange(!checked);
      }
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      id={id}
      name={name}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`toggle-switch-btn ${className}`}
      style={{
        width: "44px",
        minWidth: "44px",
        maxWidth: "44px",
        height: "24px",
        minHeight: "24px",
        maxHeight: "24px",
        borderRadius: "9999px",
        background: disabled
          ? "rgba(148, 163, 184, 0.4)"
          : checked
          ? "var(--brand-primary, #0f172a)"
          : "#cbd5e1",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        flexShrink: 0,
        padding: 0,
        margin: 0,
        boxSizing: "border-box",
        transition: "background-color 0.2s ease, opacity 0.2s ease",
        opacity: disabled ? 0.6 : 1,
        outline: "none"
      }}
      onFocus={(e) => {
        if (!disabled) {
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.35)";
        }
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <span
        className="toggle-switch-thumb"
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.28)",
          position: "absolute",
          top: "3px",
          left: checked ? "23px" : "3px",
          transition: "left 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "none"
        }}
      />
    </button>
  );
}

export default ToggleSwitch;
