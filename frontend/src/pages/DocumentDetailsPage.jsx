import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTemporaryAccess } from "../context/TemporaryAccessContext";
import {
  apiGetDocument,
  apiDownloadDocument,
  apiPreviewDocument,
  apiDeleteDocument,
  apiGetPermissions,
  apiUpdateDocument,
  apiUnlockDocument
} from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { ShareModal } from "../components/common/ShareModal";
import { OtpModal } from "../components/common/OtpModal";
import { DocumentViewerModal } from "../components/common/DocumentViewerModal";
import {
  FileText,
  Download,
  Eye,
  Edit,
  Trash2,
  Share2,
  KeyRound,
  ShieldCheck,
  Lock,
  Clock,
  Calendar,
  HardDrive,
  Users,
  ArrowLeft,
  ShieldAlert,
  AlertTriangle,
  Timer,
  CheckCircle2,
  Sliders,
  Sparkles
} from "lucide-react";

export function DocumentDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const {
    startAccess,
    endAccess,
    hasActiveAccess,
    activeSession,
    formattedCountdown,
    remainingSeconds
  } = useTemporaryAccess();

  const [document, setDocument] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Actions
  const [downloading, setDownloading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  // Viewer In-App Document Viewing State (Strictly View-Only)
  const [viewerModalOpen, setViewerModalOpen] = useState(false);
  const [viewerBlobUrl, setViewerBlobUrl] = useState(null);
  const [viewerMimeType, setViewerMimeType] = useState(null);
  const [viewerUnlockLoading, setViewerUnlockLoading] = useState(false);
  const [viewerUnlockError, setViewerUnlockError] = useState(null);

  // Viewer Unlock State
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Owner Timer Configuration State
  const [showTimerConfig, setShowTimerConfig] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerDurationMinutes, setTimerDurationMinutes] = useState(5);
  const [autoDelete, setAutoDelete] = useState(true);
  const [savingTimer, setSavingTimer] = useState(false);

  const fetchDoc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetDocument(id);
      if (!res.document) {
        throw new Error("Document not found");
      }
      setDocument(res.document);
      setTimerEnabled(Boolean(res.document.timer_enabled));
      setTimerDurationMinutes(Number(res.document.timer_duration_minutes || 5));
      setAutoDelete(res.document.auto_delete !== false);

      // If owner, fetch permission list
      const isOwner = String(res.document.owner_id) === String(user?.id) || res.document.access_level === "owner";
      if (isOwner) {
        try {
          const permRes = await apiGetPermissions(id);
          setPermissions(permRes.permissions || []);
        } catch (_permErr) {}
      }
    } catch (err) {
      setError(err.message || "Document not found or access denied.");
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    fetchDoc();
  }, [fetchDoc]);

  // Listen for auto-delete event across tabs / context
  useEffect(() => {
    const handleAutoDeleted = (e) => {
      if (String(e.detail?.documentId) === String(id)) {
        showToast(
          `Access timer expired. "${document?.name || "Document"}" was automatically deleted from the vault.`,
          "error"
        );
        navigate("/documents");
      }
    };
    window.addEventListener("document-auto-deleted", handleAutoDeleted);
    return () => window.removeEventListener("document-auto-deleted", handleAutoDeleted);
  }, [id, document, navigate, showToast]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const dlRes = await apiDownloadDocument(document.id, document.name);
      showToast(`Decrypted and downloaded "${document.name}"`, "success");

      // If document has timed access enabled, start or maintain active temporary access
      if (document.timer_enabled && dlRes?.blobUrl) {
        startAccess(
          document,
          dlRes.blobUrl,
          dlRes.blob,
          (document.timer_duration_minutes || 5) * 60
        );
      }
    } catch (err) {
      showToast(err.message || "Failed to download document", "error");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await apiDeleteDocument(document.id);
      showToast("Document deleted successfully from vault.", "success");
      setDeleteModalOpen(false);
      navigate("/documents");
    } catch (err) {
      showToast(err.message || "Failed to delete document", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Viewer In-App Document Preview (View-Only, Zero Downloads)
  const handleOpenViewer = async () => {
    setViewerModalOpen(true);
    setViewerUnlockError(null);
    if (isUnlocked || (!document.secret_key_hash && !document.timer_enabled)) {
      setViewerUnlockLoading(true);
      try {
        const previewRes = await apiPreviewDocument(document.id);
        setViewerBlobUrl(previewRes.blobUrl);
        setViewerMimeType(previewRes.mimeType);
        setIsUnlocked(true);
        startAccess(
          document,
          previewRes.blobUrl,
          previewRes.blob,
          (document.timer_duration_minutes || 5) * 60
        );
      } catch (err) {
        setViewerUnlockError(err.message || "Failed to load document preview.");
      } finally {
        setViewerUnlockLoading(false);
      }
    }
  };

  const handleViewerUnlockSubmit = async (key) => {
    setViewerUnlockLoading(true);
    setViewerUnlockError(null);
    try {
      await apiUnlockDocument(document.id, key);
      const previewRes = await apiPreviewDocument(document.id);
      setViewerBlobUrl(previewRes.blobUrl);
      setViewerMimeType(previewRes.mimeType);
      setIsUnlocked(true);

      const durationMinutes = document.timer_duration_minutes || 5;
      startAccess(
        document,
        previewRes.blobUrl,
        previewRes.blob,
        durationMinutes * 60
      );

      showToast(`Secret key accepted! ${durationMinutes}-minute access countdown started.`, "success");
    } catch (err) {
      setViewerUnlockError(err.message || "Invalid secret key passcode.");
    } finally {
      setViewerUnlockLoading(false);
    }
  };

  // Secret Key (OTP) Verification to unlock timed document
  const handleOtpVerify = async (code) => {
    setOtpLoading(true);
    setOtpError(null);
    try {
      await apiUnlockDocument(document.id, code);
      setIsUnlocked(true);
      setOtpModalOpen(false);

      const durationMinutes = document.timer_duration_minutes || 5;
      const durationSeconds = durationMinutes * 60;

      // Start temporary access countdown timer upon secret key verification
      startAccess(document, null, null, durationSeconds);

      showToast(
        `Secret key accepted! ${durationMinutes}-minute access countdown started.`,
        "success"
      );

      // If viewer, open in-app viewer (no download); if owner/admin, trigger download
      const isOwnerOrAdmin = document && (String(document.owner_id) === String(user?.id) || document.access_level === "owner" || user?.role === "owner" || user?.role === "admin");
      if (!isOwnerOrAdmin) {
        handleOpenViewer();
      } else {
        handleDownload();
      }
    } catch (err) {
      setOtpError(err.message || "Invalid secret key passcode.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Owner saves Timer & Auto-Delete Settings
  const handleSaveTimerSettings = async (e) => {
    if (e) e.preventDefault();
    setSavingTimer(true);
    try {
      const res = await apiUpdateDocument(document.id, {
        timer_enabled: timerEnabled,
        timer_duration_minutes: Number(timerDurationMinutes),
        auto_delete: autoDelete
      });
      if (res?.document) {
        setDocument((prev) => ({
          ...prev,
          ...res.document,
          timer_enabled: timerEnabled,
          timer_duration_minutes: Number(timerDurationMinutes),
          auto_delete: autoDelete
        }));
      } else {
        setDocument((prev) => ({
          ...prev,
          timer_enabled: timerEnabled,
          timer_duration_minutes: Number(timerDurationMinutes),
          auto_delete: autoDelete
        }));
      }
      showToast("Access timer and auto-delete settings saved successfully", "success");
      setShowTimerConfig(false);
    } catch (err) {
      showToast(err.message || "Failed to update timer policy", "error");
    } finally {
      setSavingTimer(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "860px", width: "100%", margin: "60px auto", textAlign: "center" }} className="animate-fade-in">
        <div style={{ color: "var(--text-muted)", fontSize: "14.5px", fontWeight: 500 }}>
          Verifying security credentials and loading document envelope...
        </div>
      </div>
    );
  }

  // Access Denied / Not Found Screen
  if (error || !document) {
    return (
      <div style={{ maxWidth: "600px", width: "100%", margin: "40px auto", boxSizing: "border-box" }} className="animate-fade-in">
        <div className="card-white responsive-page-card" style={{ padding: "40px 24px", textAlign: "center", borderRadius: "24px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(220, 38, 38, 0.1)",
              border: "1px solid rgba(220, 38, 38, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#dc2626",
              marginBottom: "16px"
            }}
          >
            <ShieldAlert size={32} />
          </div>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px"
            }}
          >
            Access Denied / Document Unavailable
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>
            {error || "You do not have discretionary access permission to inspect this confidential document, or its access timer has expired."}
          </p>
          <button
            onClick={() => navigate("/documents")}
            className="btn btn-primary"
            style={{ borderRadius: "9999px" }}
          >
            Return to Vault
          </button>
        </div>
      </div>
    );
  }

  const isOwner = String(document.owner_id) === String(user?.id) || document.access_level === "owner" || user?.role === "owner";
  const isAdmin = user?.role === "admin";
  const isViewer = !isOwner && !isAdmin;

  // Active timer status for this document
  const isThisDocActiveSession = hasActiveAccess && String(activeSession?.document?.id) === String(document.id);
  const requiresSecretKeyToUnlock = isViewer && document.timer_enabled && !isUnlocked && !isThisDocActiveSession;

  return (
    <div
      style={{
        maxWidth: "940px",
        width: "100%",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
        boxSizing: "border-box"
      }}
      className="animate-fade-in"
    >
      {/* Top Breadcrumb & Return Action - Fully Responsive */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          width: "100%"
        }}
      >
        <Link
          to="/documents"
          className="btn-frosted-pill"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            color: "var(--text-primary)",
            fontWeight: 600,
            textDecoration: "none",
            borderRadius: "9999px",
            padding: "6px 14px"
          }}
        >
          <ArrowLeft size={15} />
          <span>Back to My Vault</span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {document.timer_enabled && (
            <span
              style={{
                fontSize: "11.5px",
                padding: "4px 10px",
                borderRadius: "9999px",
                background: "rgba(239, 68, 68, 0.12)",
                color: "#b91c1c",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              <Timer size={13} />
              <span>{document.timer_duration_minutes || 5} Min Self-Destruct</span>
            </span>
          )}

          <span
            style={{
              fontSize: "11.5px",
              padding: "4px 10px",
              borderRadius: "9999px",
              background: "rgba(5, 150, 105, 0.1)",
              color: "#065f46",
              border: "1px solid rgba(5, 150, 105, 0.25)",
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: "5px"
            }}
          >
            <ShieldCheck size={13} />
            <span>AES-256-GCM Envelope Verified</span>
          </span>
        </div>
      </div>

      {/* Live Countdown Banner (When Viewer Has Unlocked and Timer is Running) */}
      {isThisDocActiveSession && (
        <div
          style={{
            padding: "12px 18px",
            background: remainingSeconds <= 60 ? "rgba(254, 242, 242, 0.95)" : "rgba(254, 243, 199, 0.95)",
            border: remainingSeconds <= 60 ? "1px solid rgba(239, 68, 68, 0.4)" : "1px solid rgba(245, 158, 11, 0.4)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "10px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: remainingSeconds <= 60 ? "#dc2626" : "#d97706",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Clock size={16} />
            </div>
            <div>
              <span style={{ fontSize: "13px", fontWeight: 700, color: remainingSeconds <= 60 ? "#991b1b" : "#92400e" }}>
                Active Access Countdown: {formattedCountdown} Remaining
              </span>
              <p style={{ margin: "2px 0 0", fontSize: "11.5px", color: remainingSeconds <= 60 ? "#b91c1c" : "#b45309" }}>
                Document will be automatically deleted from the vault when this timer expires.
              </p>
            </div>
          </div>
          <button
            onClick={() => endAccess("manual")}
            className="btn btn-sm btn-secondary"
            style={{ borderRadius: "8px", fontSize: "11.5px", height: "30px" }}
          >
            End Access Now
          </button>
        </div>
      )}

      {/* Main Document Details Card */}
      <div className="card-white responsive-page-card" style={{ borderRadius: "24px", width: "100%", boxSizing: "border-box" }}>
        {/* Header Block with Icon, Title, and Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "24px",
            paddingBottom: "20px",
            borderBottom: "1px solid rgba(226, 232, 240, 0.8)",
            width: "100%"
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", minWidth: 0, flex: "1 1 240px" }}>
            <div
              style={{
                width: "50px",
                height: "50px",
                borderRadius: "14px",
                background: "rgba(241, 245, 249, 0.9)",
                color: "var(--brand-primary, #0f172a)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <FileText size={26} />
            </div>

            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h1
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0,
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    lineHeight: 1.3
                  }}
                >
                  {document.name}
                </h1>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: "rgba(15, 23, 42, 0.06)",
                    color: "var(--text-secondary)",
                    whiteSpace: "nowrap"
                  }}
                >
                  {document.category || "General"}
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12.5px",
                  color: "var(--text-muted)",
                  marginTop: "6px",
                  flexWrap: "wrap",
                  wordBreak: "break-word"
                }}
              >
                <span>{isOwner ? "Owned by your account" : "Assigned to your employee account"}</span>
                <span>•</span>
                <span>{isOwner ? "Full discretionary management privileges" : "Ready for authorized in-app viewing"}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Role-Aware & Fully Responsive */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
            {/* Viewer In-App View / Unlock Button (Strictly No Downloads for Viewers) */}
            {!isOwner && !isAdmin && (
              requiresSecretKeyToUnlock ? (
                <button
                  className="btn btn-primary btn-md"
                  onClick={() => setOtpModalOpen(true)}
                  style={{ borderRadius: "9999px", gap: "7px" }}
                  title="Enter Secret Key to Unlock"
                  aria-label="Enter Secret Key to Unlock"
                >
                  <KeyRound size={15} />
                  <span>Enter Secret Key to Unlock</span>
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-md"
                  onClick={handleOpenViewer}
                  style={{ borderRadius: "9999px", gap: "7px" }}
                  title="View Document"
                  aria-label="View Document"
                >
                  <Eye size={15} />
                  <span>View Document</span>
                </button>
              )
            )}

            {/* Owner Action Buttons */}
            {isOwner && (
              <>
                <Link
                  to={`/documents/${document.id}/permissions`}
                  className="btn btn-secondary btn-md"
                  style={{ borderRadius: "9999px", gap: "6px", textDecoration: "none" }}
                  title="Manage Access Permissions"
                >
                  <Share2 size={15} />
                  <span>Permissions</span>
                </Link>

                <Link
                  to={`/documents/${document.id}/edit`}
                  className="btn btn-secondary btn-md"
                  style={{ borderRadius: "9999px", gap: "6px", textDecoration: "none" }}
                  title="Edit Document Metadata"
                >
                  <Edit size={15} />
                  <span>Edit Metadata</span>
                </Link>

                <button
                  className="btn btn-danger btn-md"
                  onClick={() => setDeleteModalOpen(true)}
                  style={{ borderRadius: "9999px", gap: "6px" }}
                  title="Delete Document from Vault"
                >
                  <Trash2 size={15} />
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Viewer Locked Security Gate Banner (When secret key is required) */}
        {requiresSecretKeyToUnlock && (
          <div
            style={{
              padding: "16px 18px",
              background: "rgba(254, 242, 242, 0.8)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "16px",
              marginBottom: "20px",
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
              flexWrap: "wrap"
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                background: "#dc2626",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Lock size={20} />
            </div>
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "#991b1b" }}>
                  Protected by Access Timer ({document.timer_duration_minutes || 5} Min Self-Destruct)
                </h4>
              </div>
              <p style={{ margin: "4px 0 12px", fontSize: "12.5px", color: "#7f1d1d", lineHeight: 1.5 }}>
                This confidential document is configured with an automated self-destruct timer. It will become visible inside TrustVault
                only once you verify your <strong>Secret Key / Access passcode</strong>. The timer will start immediately upon verification,
                and the document will be automatically deleted from the vault when time exceeds.
              </p>
              <button
                type="button"
                onClick={() => setOtpModalOpen(true)}
                className="btn btn-sm btn-primary"
                style={{ borderRadius: "8px", gap: "6px", background: "#dc2626", borderColor: "#dc2626", color: "#ffffff" }}
              >
                <KeyRound size={13} />
                <span>Enter Secret Key to Unlock & Start Timer</span>
              </button>
            </div>
          </div>
        )}

        {/* OWNER FEATURE: Access Timer & Self-Destruct Configuration Card */}
        {isOwner && (
          <div
            style={{
              padding: "16px",
              background: "rgba(248, 250, 252, 0.85)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "18px",
              marginBottom: "24px",
              width: "100%",
              boxSizing: "border-box"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: showTimerConfig ? "14px" : "0"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: document.timer_enabled
                      ? "rgba(239, 68, 68, 0.15)"
                      : "rgba(124, 92, 219, 0.12)",
                    color: document.timer_enabled ? "#dc2626" : "var(--brand-primary, #7C5CDB)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                >
                  <Timer size={18} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Access Timer & Auto-Delete Policy
                    </h4>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: "9999px",
                        background: document.timer_enabled ? "rgba(239, 68, 68, 0.15)" : "rgba(100, 116, 139, 0.12)",
                        color: document.timer_enabled ? "#dc2626" : "var(--text-muted)"
                      }}
                    >
                      {document.timer_enabled
                        ? `⏱️ Active (${document.timer_duration_minutes || 5} Mins • Auto-Delete ON)`
                        : "Permanent Access (No Timer)"}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                    {document.timer_enabled
                      ? `Countdown starts when viewer enters secret key. Automatically deleted from vault when ${document.timer_duration_minutes || 5} minutes elapse.`
                      : "Viewers can access without time limitation. Enable timer to enforce automatic self-destruction."}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowTimerConfig((prev) => !prev)}
                className="btn btn-sm btn-secondary"
                style={{ borderRadius: "8px", gap: "5px", fontSize: "12px" }}
              >
                <Sliders size={13} />
                <span>{showTimerConfig ? "Close Timer Settings" : "Configure Timer"}</span>
              </button>
            </div>

            {/* Expandable Timer Configuration Drawer */}
            {showTimerConfig && (
              <form
                onSubmit={handleSaveTimerSettings}
                style={{
                  marginTop: "14px",
                  paddingTop: "14px",
                  borderTop: "1px solid rgba(226, 232, 240, 0.8)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px"
                }}
              >
                {/* Enable Timer Switch */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="checkbox"
                    id="enable-doc-timer"
                    checked={timerEnabled}
                    onChange={(e) => setTimerEnabled(e.target.checked)}
                    style={{ width: "18px", height: "18px", cursor: "pointer" }}
                  />
                  <label htmlFor="enable-doc-timer" style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", cursor: "pointer" }}>
                    Enable Time-Limited Access (Countdown starts when viewer verifies secret key)
                  </label>
                </div>

                {/* Duration Presets */}
                {timerEnabled && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
                      Select Access Duration:
                    </span>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                      {[1, 2, 5, 10, 15, 30, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setTimerDurationMinutes(mins)}
                          className={`btn btn-sm ${timerDurationMinutes === mins ? "btn-primary" : "btn-secondary"}`}
                          style={{ borderRadius: "8px", fontSize: "11.5px", padding: "4px 10px", height: "30px" }}
                        >
                          {mins} Min{mins > 1 ? "s" : ""}
                        </button>
                      ))}

                      {/* Custom Minutes Input */}
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <input
                          type="number"
                          min="1"
                          max="1440"
                          value={timerDurationMinutes}
                          onChange={(e) => setTimerDurationMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                          style={{
                            width: "60px",
                            height: "30px",
                            padding: "2px 6px",
                            borderRadius: "8px",
                            border: "1px solid rgba(203, 213, 225, 0.9)",
                            fontSize: "12px",
                            textAlign: "center"
                          }}
                        />
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>mins custom</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto Delete Toggle */}
                {timerEnabled && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      id="auto-delete-checkbox"
                      checked={autoDelete}
                      onChange={(e) => setAutoDelete(e.target.checked)}
                      style={{ width: "18px", height: "18px", cursor: "pointer" }}
                    />
                    <label htmlFor="auto-delete-checkbox" style={{ fontSize: "13px", fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>
                      Automatically delete document from vault when time exceeds (Self-Destruct)
                    </label>
                  </div>
                )}

                {/* Submit Action */}
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => setShowTimerConfig(false)}
                    className="btn btn-sm btn-secondary"
                    style={{ borderRadius: "8px" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingTimer}
                    className="btn btn-sm btn-primary"
                    style={{ borderRadius: "8px", gap: "5px" }}
                  >
                    {savingTimer ? "Saving Policy..." : "Save Timer Settings"}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Clean Metadata Overview - 2x2 or auto-fit responsive grid */}
        <h4
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "15px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "14px"
          }}
        >
          Document Metadata
        </h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
            gap: "12px",
            width: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "14px", borderRadius: "16px", border: "1px solid rgba(226, 232, 240, 0.8)", minWidth: 0 }}>
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
              Document Identifier
            </span>
            <div style={{ fontSize: "13.5px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "4px", wordBreak: "break-all" }}>
              #{document.id}
            </div>
          </div>

          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "14px", borderRadius: "16px", border: "1px solid rgba(226, 232, 240, 0.8)", minWidth: 0 }}>
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
              File Size
            </span>
            <div style={{ fontSize: "13.5px", fontWeight: 600, fontFamily: "var(--font-mono)", color: "var(--text-primary)", marginTop: "4px" }}>
              {formatFileSize(document.size_bytes)}
            </div>
          </div>

          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "14px", borderRadius: "16px", border: "1px solid rgba(226, 232, 240, 0.8)", minWidth: 0 }}>
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
              File Classification
            </span>
            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px", wordBreak: "break-word" }}>
              {document.category || "General"}
            </div>
          </div>

          <div style={{ background: "rgba(248, 250, 252, 0.8)", padding: "14px", borderRadius: "16px", border: "1px solid rgba(226, 232, 240, 0.8)", minWidth: 0 }}>
            <span style={{ fontSize: "10.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "block" }}>
              Availability Date
            </span>
            <div style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--text-secondary)", marginTop: "4px" }}>
              {formatDate(document.created_at)}
            </div>
          </div>
        </div>

        {/* Owner Permission Summary Section */}
        {isOwner && (
          <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(226, 232, 240, 0.8)", width: "100%" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={16} color="var(--brand-primary, #7C5CDB)" />
                <h4 style={{ fontFamily: "var(--font-heading)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                  Active Collaborators ({permissions.length})
                </h4>
              </div>

              <Link
                to={`/documents/${document.id}/permissions`}
                style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--brand-primary, #7C5CDB)", textDecoration: "none" }}
              >
                Manage Permissions →
              </Link>
            </div>

            {permissions.length === 0 ? (
              <div style={{ padding: "14px 18px", background: "rgba(248, 250, 252, 0.8)", borderRadius: "14px", fontSize: "12.5px", color: "var(--text-muted)" }}>
                No discretionary permissions granted to external users yet.
              </div>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {permissions.map((p) => (
                  <div
                    key={p.id || p.user_id}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "5px 10px",
                      background: "rgba(248, 250, 252, 0.9)",
                      border: "1px solid rgba(226, 232, 240, 0.9)",
                      borderRadius: "9999px",
                      fontSize: "11.5px",
                      maxWidth: "100%"
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--text-primary)", wordBreak: "break-all" }}>{p.user_email}</span>
                    <span
                      style={{
                        fontSize: "9.5px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        padding: "1px 6px",
                        borderRadius: "9999px",
                        background: p.permission === "edit" ? "rgba(16, 185, 129, 0.15)" : "rgba(15, 23, 42, 0.08)",
                        color: p.permission === "edit" ? "#059669" : "#0f172a",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {p.permission}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${document.name}"? This action cannot be undone and will revoke all associated permissions.`}
        confirmText="Delete Document"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      {/* OTP / Secret Key Modal */}
      {otpModalOpen && (
        <OtpModal
          documentTitle={document.name}
          titleText="Secret Key Verification"
          supportingText={
            document.timer_enabled
              ? `Enter the 6-digit Secret Key to unlock "${document.name}" and start the ${document.timer_duration_minutes || 5}-minute access timer.`
              : "Enter the verification code sent to your corporate email to continue."
          }
          buttonText="Verify Secret Key & Unlock"
          isOpen={otpModalOpen}
          onClose={() => {
            setOtpModalOpen(false);
            setOtpError(null);
          }}
          onVerify={handleOtpVerify}
          loading={otpLoading}
          error={otpError}
        />
      )}

      {/* In-App Document Viewer Modal (View-Only, Zero Downloads) */}
      <DocumentViewerModal
        isOpen={viewerModalOpen}
        onClose={() => setViewerModalOpen(false)}
        document={document}
        blobUrl={viewerBlobUrl}
        mimeType={viewerMimeType}
        isUnlocked={isUnlocked}
        onUnlockSubmit={handleViewerUnlockSubmit}
        unlockLoading={viewerUnlockLoading}
        unlockError={viewerUnlockError}
        remainingSeconds={remainingSeconds}
        onEndAccess={() => {
          endAccess("manual");
          setIsUnlocked(false);
          setViewerModalOpen(false);
        }}
      />
    </div>
  );
}

export default DocumentDetailsPage;
