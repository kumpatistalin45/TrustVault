import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function ErrorState({
  title = "Something went wrong",
  message = "Could not load the requested information. Please try again.",
  onRetry
}) {
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
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          background: "rgba(244, 63, 94, 0.12)",
          border: "1px solid rgba(244, 63, 94, 0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fb7185",
          marginBottom: "16px"
        }}
      >
        <AlertCircle size={32} />
      </div>
      <h4 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
        {title}
      </h4>
      <p style={{ fontSize: "14px", color: "var(--text-muted)", maxWidth: "380px", marginBottom: onRetry ? "20px" : "0" }}>
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} size="sm" icon={<RefreshCw size={14} />}>
          Try Again
        </Button>
      )}
    </div>
  );
}

export default ErrorState;

