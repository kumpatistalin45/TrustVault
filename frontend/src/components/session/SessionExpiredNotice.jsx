import React from "react";
import { Link } from "react-router-dom";
import { Clock, ShieldCheck, ArrowRight, Lock } from "lucide-react";

export function SessionExpiredNotice({
  role = "viewer",
  onLoginAgain,
  reason = "inactivity", // "inactivity" | "token_expired" | "policy_enforcement"
  className = "",
  style = {}
}) {
  const reasonText = {
    inactivity: "Your session has expired due to 15 minutes of inactivity to protect corporate data.",
    token_expired: "Your authentication token has reached its security validity limit.",
    policy_enforcement: "Security policies require periodic re-authentication for authorized documents."
  }[reason] || "Your session has expired. Please sign in again to continue.";

  return (
    <div
      className={`session-expired-notice card-white ${className}`}
      style={{
        padding: "36px 32px",
        borderRadius: "28px",
        maxWidth: "520px",
        margin: "0 auto",
        textAlign: "center",
        boxShadow: "0 20px 50px rgba(15, 23, 42, 0.1)",
        ...style
      }}
    >
      <div
        style={{
          width: "56px",
          height: "56px",
          borderRadius: "20px",
          background: "rgba(15, 23, 42, 0.06)",
          color: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 20px auto"
        }}
      >
        <Clock size={28} />
      </div>

      <span
        style={{
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--text-muted)",
          display: "block",
          marginBottom: "6px"
        }}
      >
        Enterprise Session Timeout • {role.toUpperCase()}
      </span>

      <h3
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "22px",
          fontWeight: 700,
          color: "var(--text-primary)",
          margin: "0 0 12px 0",
          letterSpacing: "-0.01em"
        }}
      >
        Session Expired
      </h3>

      <p
        style={{
          fontSize: "14px",
          color: "var(--text-secondary)",
          lineHeight: 1.55,
          maxWidth: "420px",
          margin: "0 auto 24px auto"
        }}
      >
        {reasonText}
      </p>

      <div
        style={{
          background: "rgba(15, 23, 42, 0.04)",
          borderRadius: "14px",
          padding: "10px 14px",
          fontSize: "11.5px",
          color: "var(--text-muted)",
          lineHeight: 1.4,
          marginBottom: "28px",
          textAlign: "left"
        }}
      >
        <strong>Security Notice:</strong> In-memory decryption keys and temporary buffers have been purged from your browser to maintain confidentiality.
      </div>

      {onLoginAgain ? (
        <button
          type="button"
          onClick={onLoginAgain}
          className="btn-primary"
          style={{
            width: "100%",
            padding: "12px 20px",
            fontSize: "14px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}
        >
          <span>Sign In Again</span>
          <ArrowRight size={15} />
        </button>
      ) : (
        <Link
          to="/login"
          className="btn-primary"
          style={{
            width: "100%",
            padding: "12px 20px",
            fontSize: "14px",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px"
          }}
        >
          <span>Sign In Again</span>
          <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}

export default SessionExpiredNotice;
