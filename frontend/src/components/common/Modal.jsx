import React, { useEffect } from "react";
import { X } from "lucide-react";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "520px",
  showClose = true
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        background: "rgba(15, 23, 42, 0.35)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-fade-in modal-dialog"
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "calc(100dvh - 32px)",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          border: "1px solid rgba(255, 255, 255, 0.95)",
          borderRadius: "28px",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18), 0 4px 16px rgba(15, 23, 42, 0.06)",
          padding: 0,
          overflow: "hidden",
          margin: "auto"
        }}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="modal-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 28px",
            borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
            flexShrink: 0
          }}
        >
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "19px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
              letterSpacing: "-0.01em",
              wordBreak: "break-word",
              overflowWrap: "anywhere"
            }}
          >
            {title}
          </h2>
          {showClose && (
            <button
              onClick={onClose}
              className="btn-circle"
              aria-label="Close modal"
              style={{ width: "34px", height: "34px", flexShrink: 0 }}
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div
          className="modal-body"
          style={{
            padding: "26px 28px",
            overflowY: "auto",
            flex: "1 1 auto",
            WebkitOverflowScrolling: "touch"
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default Modal;

