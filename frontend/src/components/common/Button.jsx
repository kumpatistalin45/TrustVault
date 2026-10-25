import React from "react";
import { Loader2 } from "lucide-react";

export function Button({
  children,
  variant = "primary", // primary, cyan, secondary, danger, ghost, pill
  size = "md", // sm, md, lg
  loading = false,
  loadingText = null,
  disabled = false,
  icon = null,
  className = "",
  style = {},
  ...props
}) {
  const sizeStyles = {
    sm: { padding: "6px 12px", fontSize: "13px" },
    md: { padding: "9px 16px", fontSize: "14px" },
    lg: { padding: "12px 22px", fontSize: "15px" }
  };

  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || loading}
      style={{
        ...sizeStyles[size],
        ...style
      }}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>{loadingText || (typeof children === "string" ? children : "Processing...")}</span>
        </>
      ) : (
        <>
          {icon && <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}

export default Button;

