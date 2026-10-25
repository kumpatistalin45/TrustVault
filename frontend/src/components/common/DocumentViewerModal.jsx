import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { formatFileSize } from "../../services/mockData";
import {
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Clock,
  X,
  FileText,
  Lock,
  AlertTriangle
} from "lucide-react";

export function DocumentViewerModal({
  isOpen,
  onClose,
  document: doc,
  blobUrl,
  mimeType,
  remainingSeconds,
  isUnlocked = false,
  onUnlockSubmit,
  unlockLoading = false,
  unlockError = null,
  onEndAccess
}) {
  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [textContent, setTextContent] = useState("");

  // Clear input and transient plaintext buffers when modal closes or changes doc
  useEffect(() => {
    if (!isOpen) {
      setKeyInput("");
      setShowKey(false);
      setTextContent("");
    } else {
      setKeyInput("");
      setShowKey(false);
      setTextContent("");
    }
    return () => {
      setTextContent("");
      setKeyInput("");
    };
  }, [isOpen, doc?.id]);

  // Read text content if plain text
  useEffect(() => {
    if (blobUrl && (mimeType?.includes("text") || doc?.name?.endsWith(".txt"))) {
      fetch(blobUrl)
        .then((r) => r.text())
        .then(setTextContent)
        .catch(() => setTextContent(""));
    }
  }, [blobUrl, mimeType, doc?.name]);

  if (!isOpen || !doc) return null;

  const handleKeyFormSubmit = (e) => {
    e.preventDefault();
    if (!keyInput.trim()) return;
    if (onUnlockSubmit) {
      onUnlockSubmit(keyInput.trim());
    }
  };

  const formatCountdown = (secs) => {
    if (typeof secs !== "number" || secs <= 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const isPdf =
    mimeType === "application/pdf" ||
    doc.mime_type === "application/pdf" ||
    doc.name?.toLowerCase().endsWith(".pdf");

  const isImage =
    mimeType?.startsWith("image/") ||
    doc.mime_type?.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp)$/i.test(doc.name || "");

  const isTxt =
    mimeType?.includes("text") ||
    doc.mime_type === "text/plain" ||
    doc.name?.toLowerCase().endsWith(".txt");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isUnlocked ? `Viewing: ${doc.name}` : `Security Unlock — ${doc.name}`}
      maxWidth={isUnlocked ? "860px" : "480px"}
    >
      {!isUnlocked ? (
        /* 1. Enter Access Key / Passphrase Gate */
        <form onSubmit={handleKeyFormSubmit} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "rgba(14, 165, 233, 0.1)",
                color: "#0284c7",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "14px"
              }}
            >
              <KeyRound size={26} />
            </div>

            <h3
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "19px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 6px 0"
              }}
            >
              Passphrase Required
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
              This confidential document requires an access key to unlock in-app viewing.
            </p>
          </div>

          {/* Error Banner */}
          {unlockError && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "12px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                fontSize: "12.5px",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <AlertTriangle size={16} color="#dc2626" />
              <span>{unlockError}</span>
            </div>
          )}

          {/* Passphrase Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              htmlFor="viewer-access-key-input"
              style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}
            >
              Access Key / Passphrase
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="viewer-access-key-input"
                type={showKey ? "text" : "password"}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="Enter document access key..."
                autoFocus
                required
                style={{
                  width: "100%",
                  padding: "10px 42px 10px 14px",
                  borderRadius: "12px",
                  border: "1px solid rgba(226, 232, 240, 0.9)",
                  background: "#f8fafc",
                  fontSize: "14px",
                  outline: "none",
                  boxSizing: "border-box",
                  fontFamily: showKey ? "inherit" : "var(--font-mono)"
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px"
                }}
                aria-label={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Compliance & Timer Notice */}
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(241, 245, 249, 0.7)",
              borderRadius: "12px",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              fontSize: "11.5px",
              color: "var(--text-muted)",
              lineHeight: 1.45
            }}
          >
            <strong>Security Notice:</strong> Successful verification starts a temporary viewing window ({doc.timer_duration_minutes || 5} minutes). Documents are decryptable in-memory only. Downloads are restricted.
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ borderRadius: "9999px", padding: "8px 18px", fontSize: "13px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={unlockLoading || !keyInput.trim()}
              className="btn btn-primary"
              style={{ borderRadius: "9999px", padding: "8px 22px", fontSize: "13px", gap: "6px" }}
            >
              <KeyRound size={14} className={unlockLoading ? "animate-spin" : ""} />
              <span>{unlockLoading ? "Verifying..." : "Unlock & View"}</span>
            </button>
          </div>
        </form>
      ) : (
        /* 2. Decrypted In-App Document Viewer */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Top Info & Countdown Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 18px",
              background: "rgba(248, 250, 252, 0.95)",
              border: "1px solid rgba(226, 232, 240, 0.8)",
              borderRadius: "16px",
              flexWrap: "wrap",
              gap: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(14, 165, 233, 0.1)",
                  color: "#0284c7",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}
              >
                <FileText size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    display: "block",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                  title={doc.name}
                >
                  {doc.name}
                </span>
                <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {formatFileSize(doc.size_bytes)} • {doc.category || "General"} • AES-256-GCM
                </span>
              </div>
            </div>

            {/* Timer countdown badge */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: typeof remainingSeconds === "number" && remainingSeconds <= 60 ? "#fef2f2" : "#f0fdf4",
                border: typeof remainingSeconds === "number" && remainingSeconds <= 60 ? "1px solid #fecaca" : "1px solid #bbf7d0",
                color: typeof remainingSeconds === "number" && remainingSeconds <= 60 ? "#dc2626" : "#166534",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                fontFamily: "var(--font-mono)"
              }}
            >
              <Clock size={13} />
              <span>
                {typeof remainingSeconds === "number" && remainingSeconds > 0
                  ? `Access expires in ${formatCountdown(remainingSeconds)}`
                  : "Temporary View Active"}
              </span>
            </div>
          </div>

          {/* Strict Anti-Download Banner */}
          <div
            style={{
              padding: "8px 14px",
              borderRadius: "10px",
              background: "rgba(14, 165, 233, 0.08)",
              border: "1px solid rgba(14, 165, 233, 0.25)",
              color: "#0369a1",
              fontSize: "11.5px",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <ShieldCheck size={14} color="#0284c7" />
            <span>
              <strong>Protected In-App Viewing:</strong> In accordance with TrustVault security policy, Viewer accounts are restricted from exporting or downloading files.
            </span>
          </div>

          {/* Secure Display Container */}
          <div
            style={{
              width: "100%",
              minHeight: "440px",
              maxHeight: "620px",
              borderRadius: "16px",
              overflow: "hidden",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative"
            }}
          >
            {isPdf && blobUrl ? (
              <iframe
                src={blobUrl}
                title={doc.name}
                style={{
                  width: "100%",
                  height: "560px",
                  border: "none",
                  background: "#ffffff"
                }}
              />
            ) : isImage && blobUrl ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "440px",
                  background: "#1e293b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                  boxSizing: "border-box"
                }}
              >
                <img
                  src={blobUrl}
                  alt={doc.name}
                  style={{
                    maxWidth: "100%",
                    maxHeight: "520px",
                    objectFit: "contain",
                    borderRadius: "8px",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.4)"
                  }}
                />
              </div>
            ) : isTxt ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  minHeight: "440px",
                  background: "#0f172a",
                  padding: "24px",
                  boxSizing: "border-box",
                  overflow: "auto"
                }}
              >
                <pre
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "13px",
                    color: "#f8fafc",
                    lineHeight: "1.65",
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word"
                  }}
                >
                  {textContent || "Decrypted text content loaded in memory."}
                </pre>
              </div>
            ) : (
              /* Binary Office / Other formats */
              <div style={{ textAlign: "center", padding: "40px 24px", color: "#f8fafc" }}>
                <FileText size={48} color="#94a3b8" style={{ margin: "0 auto 16px auto" }} />
                <h4 style={{ fontSize: "17px", fontWeight: 700, margin: "0 0 8px 0" }}>
                  Encrypted {doc.category || "Office"} Document
                </h4>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#94a3b8",
                    maxWidth: "420px",
                    margin: "0 auto",
                    lineHeight: 1.6
                  }}
                >
                  This file ({doc.name}) is protected with AES-256-GCM envelope encryption. Proprietary binary office formats (.docx/.xlsx) cannot be executed inside the browser without external converters. Direct file downloads are prohibited for Viewer roles.
                </p>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              Sealed with AES-256-GCM • Temporary memory buffer
            </span>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{ borderRadius: "9999px", padding: "8px 20px", fontSize: "13px" }}
              >
                Close View
              </button>
              {onEndAccess && (
                <button
                  type="button"
                  onClick={onEndAccess}
                  className="btn btn-danger"
                  style={{ borderRadius: "9999px", padding: "8px 20px", fontSize: "13px" }}
                >
                  Lock Document
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default DocumentViewerModal;
