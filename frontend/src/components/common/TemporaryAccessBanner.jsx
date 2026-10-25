import React from "react";
import { useAuth } from "../../context/AuthContext";
import { useTemporaryAccess } from "../../context/TemporaryAccessContext";
import { Clock, Eye, X, ShieldAlert, FileText, Download } from "lucide-react";
import { Modal } from "./Modal";
import { formatFileSize } from "../../services/mockData";

export function TemporaryAccessBanner() {
  const { isOwner, isAdmin } = useAuth();
  const {
    activeSession,
    hasActiveAccess,
    formattedCountdown,
    remainingSeconds,
    endAccess,
    isPreviewOpen,
    setIsPreviewOpen
  } = useTemporaryAccess();

  if (!hasActiveAccess || !activeSession) return null;

  const doc = activeSession.document;
  const isExpiringSoon = remainingSeconds <= 60;

  return (
    <>
      {/* Floating Centered Access Bar Container */}
      <div
        className="temporary-access-viewport-container"
        style={{
          position: "fixed",
          bottom: "20px",
          left: 0,
          right: 0,
          zIndex: 90,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "0 16px",
          pointerEvents: "none",
          width: "100%",
          boxSizing: "border-box"
        }}
      >
        <div
          className="temporary-access-pill animate-fade-in"
          style={{
            pointerEvents: "auto",
            width: "100%",
            maxWidth: "680px",
            margin: "0 auto",
            background: isExpiringSoon
              ? "rgba(254, 242, 242, 0.96)"
              : "rgba(255, 255, 255, 0.95)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: isExpiringSoon
              ? "1.5px solid rgba(239, 68, 68, 0.35)"
              : "1.5px solid rgba(255, 255, 255, 0.9)",
            borderRadius: "9999px",
            padding: "10px 18px",
            boxShadow: isExpiringSoon
              ? "0 14px 40px rgba(220, 38, 38, 0.18)"
              : "0 14px 40px rgba(15, 23, 42, 0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            transition: "all 0.3s ease",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "50%",
                background: isExpiringSoon ? "#dc2626" : "#0f172a",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Clock size={16} />
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    fontSize: "13.5px",
                    fontWeight: 700,
                    color: isExpiringSoon ? "#991b1b" : "var(--text-primary)",
                    fontFamily: "var(--font-heading)"
                  }}
                >
                  Document available for {formattedCountdown}
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    padding: "2px 7px",
                    borderRadius: "9999px",
                    background: isExpiringSoon ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)",
                    color: isExpiringSoon ? "#b91c1c" : "#059669",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em"
                  }}
                >
                  5-Min Session
                </span>
              </div>
              <span
                style={{
                  display: "block",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {doc.name}
              </span>
            </div>
          </div>

          {/* Action Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {activeSession.blobUrl && (
              <button
                onClick={() => setIsPreviewOpen(true)}
                className="btn btn-secondary btn-sm"
                style={{
                  borderRadius: "9999px",
                  gap: "5px",
                  fontSize: "12.5px",
                  padding: "6px 14px"
                }}
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            )}

            <button
              onClick={() => endAccess("manual")}
              className="btn btn-ghost btn-sm"
              style={{
                borderRadius: "9999px",
                gap: "5px",
                fontSize: "12px",
                color: "var(--text-muted)",
                padding: "6px 12px"
              }}
              title="End temporary access and revoke in-memory URL"
            >
              <X size={13} />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>

      {/* Temporary Preview Modal */}
      {isPreviewOpen && (
        <Modal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          title={`Temporary View — ${doc.name}`}
          maxWidth="720px"
        >
          <div>
            {/* Header info */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "rgba(248, 250, 252, 0.9)",
                borderRadius: "16px",
                marginBottom: "20px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <FileText size={20} color="var(--text-primary)" />
                <div>
                  <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                    {doc.name}
                  </span>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {formatFileSize(doc.size_bytes)} • {doc.category || "General"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  background: isExpiringSoon ? "#fef2f2" : "#f0fdf4",
                  border: isExpiringSoon ? "1px solid #fecaca" : "1px solid #bbf7d0",
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  color: isExpiringSoon ? "#b91c1c" : "#166534",
                  fontSize: "12px",
                  fontWeight: 700,
                  fontFamily: "var(--font-mono)"
                }}
              >
                <Clock size={13} />
                <span>Expires in {formattedCountdown}</span>
              </div>
            </div>

            {/* Document viewer / preview container */}
            <div
              style={{
                width: "100%",
                height: "360px",
                borderRadius: "16px",
                overflow: "hidden",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                background: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                position: "relative"
              }}
            >
              {activeSession.blob?.type?.startsWith("image/") ? (
                <img
                  src={activeSession.blobUrl}
                  alt={doc.name}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              ) : activeSession.blob?.type === "application/pdf" ? (
                <iframe
                  src={activeSession.blobUrl}
                  title={doc.name}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              ) : (
                <div style={{ textAlign: "center", padding: "28px" }}>
                  <FileText size={42} color="var(--text-muted)" style={{ margin: "0 auto 12px auto" }} />
                  <h4 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 6px 0" }}>
                    In-Memory Decrypted Document
                  </h4>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", maxWidth: "380px", margin: "0 auto 18px auto", lineHeight: 1.5 }}>
                    The decrypted binary stream is currently active in browser memory. It will be permanently wiped when the countdown reaches 00:00.
                  </p>
                  {(isOwner || isAdmin) && (
                    <a
                      href={activeSession.blobUrl}
                      download={doc.name}
                      className="btn btn-primary btn-sm"
                      style={{ borderRadius: "9999px", display: "inline-flex", gap: "6px" }}
                    >
                      <Download size={13} />
                      <span>Save Copy to Downloads</span>
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Service Boundary Notice */}
            <div
              className="frosted-panel"
              style={{
                borderRadius: "16px",
                padding: "12px 16px",
                marginTop: "18px",
                fontSize: "12px",
                color: "var(--text-muted)",
                lineHeight: 1.45
              }}
            >
              <strong>Temporary Access Governance:</strong> Browser memory buffers and temporary blob URLs are wiped and revoked automatically after 5 minutes. As a standard technical boundary, files exported directly to local operating system storage cannot be removed via browser code.
            </div>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsPreviewOpen(false)}
                style={{ borderRadius: "9999px", padding: "8px 20px", fontSize: "13px" }}
              >
                Close Preview
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => endAccess("manual")}
                style={{ borderRadius: "9999px", padding: "8px 20px", fontSize: "13px" }}
              >
                End Access Now
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default TemporaryAccessBanner;
