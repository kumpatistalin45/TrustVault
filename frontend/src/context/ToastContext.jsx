import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from "lucide-react";

export const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 7);
    setToasts((prev) => [...prev, { id, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div
        className="toast-container-center"
        style={{
          position: "fixed",
          top: "24px",
          left: 0,
          right: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          padding: "0 16px",
          pointerEvents: "none",
          width: "100%",
          boxSizing: "border-box"
        }}
      >
        {toasts.map((toast) => {
          let icon = <Info size={18} color="#0284c7" />;
          let borderColor = "#bfdbfe";
          let bgColor = "rgba(255, 255, 255, 0.96)";
          let textColor = "#0f172a";

          if (toast.type === "success") {
            icon = <CheckCircle2 size={18} color="#059669" />;
            borderColor = "#a7f3d0";
          } else if (toast.type === "error") {
            icon = <AlertCircle size={18} color="#dc2626" />;
            borderColor = "#fecaca";
          } else if (toast.type === "warning") {
            icon = <AlertTriangle size={18} color="#d97706" />;
            borderColor = "#fde68a";
          }

          return (
            <div
              key={toast.id}
              className="animate-fade-in toast-card"
              style={{
                pointerEvents: "auto",
                background: bgColor,
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                border: `1.5px solid ${borderColor}`,
                borderRadius: "18px",
                padding: "13px 18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "14px",
                boxShadow: "0 16px 36px rgba(15, 23, 42, 0.16), 0 2px 8px rgba(15, 23, 42, 0.06)",
                color: textColor,
                fontSize: "13.5px",
                fontWeight: 600,
                width: "100%",
                maxWidth: "460px",
                margin: "0 auto",
                boxSizing: "border-box"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                {icon}
                <span style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>{toast.message}</span>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  flexShrink: 0
                }}
                aria-label="Close notification"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: () => {},
      dismissToast: () => {},
      toasts: [],
    };
  }
  return context;
}

export default ToastProvider;
