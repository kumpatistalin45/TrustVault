import React from "react";

export function Card({
  children,
  title,
  subtitle,
  action,
  variant = "solid", // "solid" or "dotted"
  dotted = false,
  className = "",
  style = {},
  ...props
}) {
  const cardClass = variant === "dotted" || dotted ? "card-dotted" : "card";

  return (
    <div
      className={`${cardClass} ${className}`}
      style={{ boxSizing: "border-box", minWidth: 0, maxWidth: "100%", ...style }}
      {...props}
    >
      {(title || action) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: subtitle ? "6px" : "18px",
            borderBottom: "1px solid var(--border-subtle)",
            paddingBottom: "14px"
          }}
        >
          <div>
            {title && (
              <h3 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)" }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                {subtitle}
              </p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default Card;

