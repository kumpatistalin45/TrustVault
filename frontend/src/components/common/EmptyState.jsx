import React from "react";
import { FolderOpen } from "lucide-react";
import { Button } from "./Button";

export function EmptyState({
  icon = <FolderOpen size={36} color="var(--text-muted)" />,
  title = "No documents found",
  description = "No items match your query or you haven't uploaded any files yet.",
  actionLabel,
  actionText,
  onAction
}) {
  const label = actionText || actionLabel;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
        textAlign: "center"
      }}
    >
      <div
        style={{
          width: "68px",
          height: "68px",
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "16px"
        }}
      >
        {React.isValidElement(icon)
          ? icon
          : typeof icon === "function" || (typeof icon === "object" && icon !== null && "$$typeof" in icon)
          ? React.createElement(icon, { size: 32, color: "var(--text-muted)" })
          : icon}
      </div>
      <h4 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
        {title}
      </h4>
      <p style={{ fontSize: "14px", color: "var(--text-muted)", maxWidth: "380px", marginBottom: label ? "20px" : "0" }}>
        {description}
      </p>
      {label && onAction && (
        <Button variant="cyan" onClick={onAction} size="sm">
          {label}
        </Button>
      )}
    </div>
  );
}

export default EmptyState;

