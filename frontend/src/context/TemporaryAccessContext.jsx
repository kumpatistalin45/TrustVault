import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "./ToastContext";
import { apiDeleteDocument } from "../services/api";

export const TemporaryAccessContext = createContext(null);

export function TemporaryAccessProvider({ children }) {
  const { showToast } = useToast();
  const [activeSession, setActiveSession] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const timerRef = useRef(null);
  const sessionRef = useRef(null);

  sessionRef.current = activeSession;

  const endAccess = useCallback(
    async (reason = "manual") => {
      const currentDoc = sessionRef.current?.document;

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (sessionRef.current?.blobUrl) {
        try {
          URL.revokeObjectURL(sessionRef.current.blobUrl);
        } catch (_err) {
          // Ignore revocation issues
        }
      }

      setActiveSession(null);
      setRemainingSeconds(0);
      setIsPreviewOpen(false);

      if (reason === "expired") {
        const shouldAutoDelete = currentDoc?.auto_delete !== false;
        if (shouldAutoDelete && currentDoc?.id) {
          try {
            await apiDeleteDocument(currentDoc.id);
            window.dispatchEvent(
              new CustomEvent("document-auto-deleted", {
                detail: { documentId: currentDoc.id, documentName: currentDoc.name }
              })
            );
            showToast(
              `Access timer expired. "${currentDoc.name || "Document"}" was automatically deleted from the vault.`,
              "error"
            );
          } catch (_delErr) {
            showToast("Your temporary document access has expired and file was removed.", "warning");
          }
        } else {
          showToast("Your temporary document access has expired.", "warning");
        }
      } else if (reason === "manual") {
        showToast("Temporary document access ended and in-memory copy cleared.", "info");
      }
    },
    [showToast]
  );

  const startAccess = useCallback(
    (document, blobUrl, blob = null, customDurationSeconds = null) => {
      // Clear any existing active session
      if (sessionRef.current?.blobUrl) {
        try {
          URL.revokeObjectURL(sessionRef.current.blobUrl);
        } catch (_e) {}
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Check document configured timer duration (e.g. 1 min, 5 min, etc.)
      const docMinutes = document?.timer_duration_minutes || (document?.access_timer_seconds ? document.access_timer_seconds / 60 : 5);
      const docSeconds = document?.access_timer_seconds || (docMinutes ? docMinutes * 60 : 300);
      const totalDuration = customDurationSeconds || docSeconds || 300;

      const now = Date.now();
      const expiresAt = now + totalDuration * 1000;

      const newSession = {
        document,
        blobUrl,
        blob,
        startedAt: now,
        expiresAt,
        durationSeconds: totalDuration
      };

      setActiveSession(newSession);
      setRemainingSeconds(totalDuration);

      timerRef.current = setInterval(() => {
        const secondsLeft = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
        setRemainingSeconds(secondsLeft);

        if (secondsLeft <= 0) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          endAccess("expired");
        }
      }, 1000);
    },
    [endAccess]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (sessionRef.current?.blobUrl) {
        try {
          URL.revokeObjectURL(sessionRef.current.blobUrl);
        } catch (_e) {}
      }
    };
  }, []);

  const formatCountdown = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  return (
    <TemporaryAccessContext.Provider
      value={{
        activeSession,
        hasActiveAccess: Boolean(activeSession && remainingSeconds > 0),
        remainingSeconds,
        formattedCountdown: formatCountdown(remainingSeconds),
        startAccess,
        endAccess,
        isPreviewOpen,
        setIsPreviewOpen
      }}
    >
      {children}
    </TemporaryAccessContext.Provider>
  );
}

export function useTemporaryAccess() {
  const context = useContext(TemporaryAccessContext);
  if (!context) {
    return {
      hasActiveAccess: false,
      activeSession: null,
      remainingSeconds: 0,
      formattedCountdown: "00:00",
      startAccess: () => {},
      endAccess: () => {},
      isPreviewOpen: false,
      setIsPreviewOpen: () => {}
    };
  }
  return context;
}

export const useSafeTemporaryAccess = useTemporaryAccess;
