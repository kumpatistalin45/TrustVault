import React, { forwardRef } from "react";

export const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    icon = null,
    id,
    type = "text",
    className = "",
    containerStyle = {},
    ...props
  },
  ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="form-group" style={containerStyle}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        {icon && (
          <span
            style={{
              position: "absolute",
              left: "12px",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              pointerEvents: "none"
            }}
          >
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={type}
          className={`form-control ${className}`}
          style={{
            paddingLeft: icon ? "38px" : "14px",
            borderColor: error ? "#f43f5e" : undefined
          }}
          {...props}
        />
      </div>
      {hint && !error && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
});

export default Input;

