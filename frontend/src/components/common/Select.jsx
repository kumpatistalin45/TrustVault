import React, { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export const Select = forwardRef(function Select(
  {
    label,
    error,
    hint,
    options = [],
    id,
    className = "",
    containerStyle = {},
    children,
    ...props
  },
  ref
) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="form-group" style={containerStyle}>
      {label && (
        <label htmlFor={selectId} className="form-label">
          {label}
        </label>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <select
          ref={ref}
          id={selectId}
          className={`form-control ${className}`}
          style={{
            appearance: "none",
            paddingRight: "36px",
            borderColor: error ? "#f43f5e" : undefined
          }}
          {...props}
        >
          {children ? (
            children
          ) : (
            options.map((opt) => (
              <option key={opt.value} value={opt.value} style={{ background: "#141824", color: "#fff" }}>
                {opt.label}
              </option>
            ))
          )}
        </select>
        <span
          style={{
            position: "absolute",
            right: "12px",
            color: "var(--text-muted)",
            pointerEvents: "none",
            display: "flex",
            alignItems: "center"
          }}
        >
          <ChevronDown size={16} />
        </span>
      </div>
      {hint && !error && <div className="form-hint">{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
});

export default Select;

