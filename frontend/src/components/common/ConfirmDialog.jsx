import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to proceed? This action cannot be undone.",
  confirmText = "Confirm",
  confirmVariant = "danger",
  loading = false
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="460px">
      <div style={{ display: "flex", gap: "16px", marginBottom: "26px", alignItems: "flex-start" }}>
        <div
          style={{
            flexShrink: 0,
            width: "46px",
            height: "46px",
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#dc2626"
          }}
        >
          <AlertTriangle size={22} />
        </div>
        <div>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.55, margin: 0 }}>
            {message}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={onClose}
          disabled={loading}
          style={{ fontSize: "13px", padding: "10px 20px" }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          style={{
            background: "#dc2626",
            color: "#ffffff",
            border: "none",
            borderRadius: "9999px",
            padding: "10px 24px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(220, 38, 38, 0.25)",
            transition: "all 0.2s"
          }}
        >
          {loading ? "Processing..." : confirmText}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;

