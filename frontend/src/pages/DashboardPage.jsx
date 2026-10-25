import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetDocuments,
  apiDownloadDocument,
  apiDeleteDocument,
  apiGetOwnerActivity,
  apiGetPermissions
} from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { ShareModal } from "../components/common/ShareModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import {
  FolderLock,
  UploadCloud,
  Users,
  HardDrive,
  Download,
  Share2,
  Lock,
  ShieldCheck,
  FileText,
  KeyRound,
  ExternalLink,
  ChevronRight,
  Clock,
  ShieldAlert,
  CheckCircle2,
  Trash2,
  Edit3,
  AlertTriangle,
  RotateCcw,
  Activity,
  Layers,
  Shield
} from "lucide-react";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia) {
      return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    }
    return (window.innerWidth || 1024) <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia) {
      const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
      const update = (e) => setIsMobile(e.matches);
      if (media.addEventListener) {
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
      } else if (media.addListener) {
        media.addListener(update);
        return () => media.removeListener(update);
      }
    }
    const handleResize = () => setIsMobile((window.innerWidth || 1024) <= breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

export function DashboardPage() {
  const { user, isOwner } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const [documents, setDocuments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [permissionStats, setPermissionStats] = useState({ sharedCount: 0, readCount: 0, editCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // Modals state
  const [shareDoc, setShareDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch real documents
      const docsRes = await apiGetDocuments({ limit: 100 });
      const allDocs = docsRes?.documents || [];
      setDocuments(allDocs);

      // 2. Filter owner documents to calculate real metrics
      const ownedDocs = allDocs.filter(
        (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
      );

      // 3. Summarize permissions for owned docs
      let totalSharedDocs = 0;
      let totalReadGrants = 0;
      let totalEditGrants = 0;

      // Check permissions for owned docs (sample up to first 5 for dashboard summary)
      for (const doc of ownedDocs.slice(0, 5)) {
        try {
          const permRes = await apiGetPermissions(doc.id);
          const perms = permRes?.permissions || [];
          if (perms.length > 0) {
            totalSharedDocs += 1;
            perms.forEach((p) => {
              if (p.permission === "edit") totalEditGrants += 1;
              else totalReadGrants += 1;
            });
          }
        } catch (_err) {
          // ignore individual permission probe errors
        }
      }

      setPermissionStats({
        sharedCount: totalSharedDocs,
        readCount: totalReadGrants,
        editCount: totalEditGrants
      });

      // 4. Fetch real owner activity
      try {
        const actRes = await apiGetOwnerActivity({ limit: 10 });
        setActivities(actRes?.activity || []);
      } catch (actErr) {
        console.warn("Could not load activity for dashboard:", actErr.message);
        setActivities([]);
      }
    } catch (err) {
      console.error("Dashboard data fetch failed:", err);
      setError(err.message || "Failed to retrieve documents from TrustVault. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real Calculated Metrics
  const myDocuments = documents.filter(
    (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
  );
  const myDocumentsCount = myDocuments.length;
  const totalStorageBytes = myDocuments.reduce((sum, d) => sum + (Number(d.size_bytes) || 0), 0);

  // Recently uploaded documents (sorted newest first)
  const recentDocs = [...myDocuments]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 5);

  const handleDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      await apiDownloadDocument(doc.id, doc.name);
      showToast(`Decrypted and downloaded "${doc.name}"`, "success");
    } catch (err) {
      showToast(err.message || "Failed to download document", "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDoc) return;
    setDeleteLoading(true);
    try {
      await apiDeleteDocument(deleteDoc.id);
      showToast(`Document "${deleteDoc.name}" deleted from vault.`, "success");
      setDeleteDoc(null);
      await loadData();
    } catch (err) {
      showToast(err.message || "Failed to delete document", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  const todayDateString = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      {/* Top Header: Role Banner + Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px", flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "rgba(15, 23, 42, 0.08)",
                color: "#0f172a",
                padding: "3px 10px",
                borderRadius: "9999px"
              }}
            >
              Document Owner Portal
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>• {todayDateString}</span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(22px, 5.5vw, 32px)",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
              margin: 0,
              lineHeight: 1.2,
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            Welcome, {user?.name || "Document Owner"}
          </h1>
          <p style={{ fontSize: "14.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Discretionary document vault • Cryptographic envelopes sealed with AES-256-GCM.
          </p>
        </div>

        {/* Top Right Action Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: "9999px", gap: "6px" }}
            title="Refresh Vault Data"
            aria-label="Refresh Vault Data"
          >
            <RotateCcw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <Link
            to="/viewers"
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: "9999px", gap: "7px", textDecoration: "none" }}
          >
            <Users size={15} />
            <span>Manage Viewers</span>
          </Link>

          <Link
            to="/documents/upload"
            className="btn btn-primary btn-sm"
            style={{ borderRadius: "9999px", gap: "7px", textDecoration: "none" }}
          >
            <UploadCloud size={15} />
            <span>Upload Document</span>
          </Link>
        </div>
      </div>

      {/* Error / Retry State Banner */}
      {error && (
        <div
          style={{
            padding: "16px 20px",
            borderRadius: "20px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={20} color="#dc2626" />
            <span style={{ fontSize: "13.5px", fontWeight: 500 }}>{error}</span>
          </div>
          <button
            onClick={loadData}
            className="btn btn-danger btn-sm"
            style={{ borderRadius: "9999px", gap: "6px" }}
          >
            <RotateCcw size={13} />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Metric Statistics Grid */}
      <div className="owner-stats-grid">
        {/* 1. My Documents */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              My Documents
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
              <FileText size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {loading ? "..." : myDocumentsCount}
          </span>
        </div>

        {/* 2. Shared Documents */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Shared Docs
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
              <Share2 size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {loading ? "..." : permissionStats.sharedCount}
          </span>
        </div>

        {/* 3. Access Grants */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Access Grants
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
              <KeyRound size={14} />
            </div>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {loading ? "..." : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", alignItems: "baseline" }}>
                <span>{permissionStats.readCount} Read</span>
                <span style={{ color: "var(--text-muted)" }}>/</span>
                <span>{permissionStats.editCount} Edit</span>
              </div>
            )}
          </div>
        </div>

        {/* 4. Vault Storage */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Vault Storage
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(139, 92, 246, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed" }}>
              <HardDrive size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "14.5px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {loading ? "..." : formatFileSize(totalStorageBytes)}
          </span>
        </div>

        {/* 5. Envelope Cipher */}
        <div className="owner-stat-card span-2-mobile">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Envelope Cipher
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
              <ShieldCheck size={14} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#059669",
                background: "rgba(16, 185, 129, 0.12)",
                padding: "3px 8px",
                borderRadius: "6px",
                letterSpacing: "0.02em",
                whiteSpace: "nowrap"
              }}
            >
              AES-256-GCM
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              TVE1 Header
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="card-white" style={{ padding: "36px", borderRadius: "28px" }}>
          <TableSkeleton rows={5} />
        </div>
      ) : myDocumentsCount === 0 ? (
        /* Empty State */
        <div className="card-white" style={{ padding: "64px 32px", textAlign: "center", borderRadius: "28px" }}>
          <EmptyState
            title="No Documents Uploaded Yet"
            description="You have not uploaded any documents to your TrustVault repository. Once uploaded, your documents are sealed with AES-256-GCM encryption and can be shared with granular permissions."
            actionText="Upload Your First Document"
            onAction={() => navigate("/documents/upload")}
          />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          {/* Section: Recently Uploaded Documents */}
          <div className="card-white responsive-page-card" style={{ padding: "30px", borderRadius: "28px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "20px"
              }}
            >
              <div>
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0
                  }}
                >
                  Recently Uploaded Documents
                </h2>
                <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                  Showing latest uploads from your account ({recentDocs.length} of {myDocumentsCount})
                </span>
              </div>

              <Link
                to="/documents"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#0f172a",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <span>View Full Library ({myDocumentsCount})</span>
                <ChevronRight size={14} />
              </Link>
            </div>

            {/* Desktop Table View of Recently Uploaded Documents */}
            {!isMobile ? (
              <div className="desktop-table-view">
                <div className="table-container" style={{ borderRadius: "20px" }}>
                <table className="vault-table">
                  <thead>
                    <tr>
                      <th>Document Name</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Uploaded Date</th>
                      <th style={{ textAlign: "right" }}>Management Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentDocs.map((doc) => {
                      const isDownloading = downloadingId === doc.id;
                      return (
                        <tr key={doc.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div
                                style={{
                                  width: "38px",
                                  height: "38px",
                                  borderRadius: "12px",
                                  background: "rgba(15, 23, 42, 0.05)",
                                  color: "#0f172a",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0
                                }}
                              >
                                <FileText size={18} style={{ margin: "auto" }} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <Link
                                  to={`/documents/${doc.id}`}
                                  className="truncate-filename"
                                  title={doc.name}
                                  style={{
                                    fontSize: "13.5px",
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                    textDecoration: "none"
                                  }}
                                >
                                  {doc.name}
                                </Link>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                  ID #{doc.id} • Owner
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span
                              style={{
                                fontSize: "11.5px",
                                padding: "3px 10px",
                                borderRadius: "9999px",
                                background: "rgba(15, 23, 42, 0.05)",
                                color: "var(--text-secondary)",
                                fontWeight: 500
                              }}
                            >
                              {doc.category || "General"}
                            </span>
                          </td>

                          <td style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                            {formatFileSize(doc.size_bytes)}
                          </td>

                          <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {formatDate(doc.created_at)}
                          </td>

                          <td style={{ textAlign: "right" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              {/* Share Permissions */}
                              <button
                                onClick={() => setShareDoc(doc)}
                                className="btn-circle"
                                style={{ width: "32px", height: "32px" }}
                                title="Manage Permissions"
                                aria-label={`Share ${doc.name}`}
                              >
                                <Share2 size={13} />
                              </button>

                              {/* Edit Metadata */}
                              <Link
                                to={`/documents/${doc.id}/edit`}
                                className="btn-circle"
                                style={{ width: "32px", height: "32px", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                                title="Edit Metadata"
                                aria-label={`Edit ${doc.name}`}
                              >
                                <Edit3 size={13} />
                              </Link>

                              {/* Delete Document */}
                              <button
                                onClick={() => setDeleteDoc(doc)}
                                className="btn-circle"
                                style={{ width: "32px", height: "32px", color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.2)" }}
                                title="Delete Document"
                                aria-label={`Delete ${doc.name}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Mobile Document Cards List (Clean Responsive Stacking) */
            <div className="mobile-doc-cards">
              {recentDocs.map((doc) => {
                const isDownloading = downloadingId === doc.id;
                return (
                  <div
                    key={doc.id}
                    style={{
                      padding: "14px 16px",
                      background: "rgba(248, 250, 252, 0.8)",
                      border: "1px solid rgba(226, 232, 240, 0.9)",
                      borderRadius: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: "rgba(15, 23, 42, 0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}
                      >
                        <FileText size={18} color="#0f172a" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          to={`/documents/${doc.id}`}
                          className="truncate-filename"
                          title={doc.name}
                          style={{
                            fontSize: "14px",
                            fontWeight: 700,
                            color: "var(--text-primary)",
                            textDecoration: "none",
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {doc.name}
                        </Link>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          <span>{formatFileSize(doc.size_bytes)}</span>
                          <span>•</span>
                          <span>{doc.category || "General"}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid rgba(226, 232, 240, 0.6)", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {formatDate(doc.created_at)}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <button
                          onClick={() => setShareDoc(doc)}
                          className="btn-circle"
                          style={{ width: "32px", height: "32px" }}
                          title="Manage Permissions"
                          aria-label={`Share ${doc.name}`}
                        >
                          <Share2 size={13} />
                        </button>
                        <Link
                          to={`/documents/${doc.id}/edit`}
                          className="btn-circle"
                          style={{ width: "32px", height: "32px", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                          title="Edit Metadata"
                          aria-label={`Edit ${doc.name}`}
                        >
                          <Edit3 size={13} />
                        </Link>
                        <button
                          onClick={() => setDeleteDoc(doc)}
                          className="btn-circle"
                          style={{ width: "32px", height: "32px", color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.2)" }}
                          title="Delete Document"
                          aria-label={`Delete ${doc.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

          {/* Section: Shared Documents & Permissions Summary + Recent Activity */}
          <div
            className="grid-responsive-2col"
            style={{
              display: "grid",
              gap: "20px",
              width: "100%",
              maxWidth: "100%",
              boxSizing: "border-box"
            }}
          >
            {/* Left Card: Discretionary Permissions Summary */}
            <div
              className="card-white responsive-page-card"
              style={{
                borderRadius: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                overflow: "hidden"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "12px",
                      background: "rgba(79, 70, 229, 0.1)",
                      color: "#4f46e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    <Users size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                      Discretionary Permissions
                    </h3>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Granular access granted to authorized users
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px", margin: "20px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "rgba(248, 250, 252, 0.8)",
                      borderRadius: "16px",
                      border: "1px solid rgba(226, 232, 240, 0.8)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <CheckCircle2 size={15} color="#059669" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Read-Only Grants
                      </span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                      {permissionStats.readCount} users
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 16px",
                      background: "rgba(248, 250, 252, 0.8)",
                      borderRadius: "16px",
                      border: "1px solid rgba(226, 232, 240, 0.8)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <CheckCircle2 size={15} color="#2563eb" />
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Edit Permission Grants
                      </span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                      {permissionStats.editCount} users
                    </span>
                  </div>
                </div>

                <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.5, margin: 0 }}>
                  As document owner, you can grant or revoke Read and Edit privileges for any of your documents at any time. Revocations take effect immediately on the next decryption attempt.
                </p>
              </div>

              <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid rgba(226, 232, 240, 0.8)" }}>
                <Link
                  to="/permissions"
                  className="btn btn-primary"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    borderRadius: "9999px",
                    fontSize: "12.5px",
                    textDecoration: "none",
                    gap: "6px",
                    padding: "10px 14px",
                    whiteSpace: "normal",
                    textAlign: "center",
                    boxSizing: "border-box"
                  }}
                >
                  <KeyRound size={14} style={{ flexShrink: 0 }} />
                  <span>Manage Discretionary Permissions</span>
                </Link>
              </div>
            </div>

            {/* Right Card: Recent Document Activity */}
            <div
              className="card-white responsive-page-card"
              style={{
                borderRadius: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                width: "100%",
                maxWidth: "100%",
                boxSizing: "border-box",
                overflow: "hidden"
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "8px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "12px",
                        background: "rgba(15, 23, 42, 0.06)",
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0
                      }}
                    >
                      <Activity size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Recent Activity
                      </h3>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        Real document lifecycle events
                      </span>
                    </div>
                  </div>

                  <Link
                    to="/activity"
                    style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a", textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap" }}
                  >
                    View All
                  </Link>
                </div>

                {activities.length === 0 ? (
                  <div
                    style={{
                      padding: "28px 16px",
                      textAlign: "center",
                      background: "rgba(248, 250, 252, 0.6)",
                      border: "1px dashed rgba(226, 232, 240, 0.9)",
                      borderRadius: "18px",
                      color: "var(--text-muted)",
                      fontSize: "13px",
                      margin: "12px 0"
                    }}
                  >
                    No activity recorded yet for your documents.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "14px 0" }}>
                    {activities.slice(0, 4).map((act, i) => (
                      <div
                        key={act.id || i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          background: "rgba(248, 250, 252, 0.8)",
                          borderRadius: "14px",
                          border: "1px solid rgba(226, 232, 240, 0.8)",
                          gap: "8px",
                          width: "100%",
                          boxSizing: "border-box",
                          minWidth: 0
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              fontSize: "10px",
                              fontWeight: 700,
                              textTransform: "uppercase",
                              padding: "2px 8px",
                              borderRadius: "9999px",
                              flexShrink: 0,
                              background:
                                act.action?.includes("upload")
                                  ? "rgba(37, 99, 235, 0.1)"
                                  : act.action?.includes("grant")
                                  ? "rgba(79, 70, 229, 0.1)"
                                  : "rgba(15, 23, 42, 0.08)",
                              color:
                                act.action?.includes("upload")
                                  ? "#2563eb"
                                  : act.action?.includes("grant")
                                  ? "#4f46e5"
                                  : "#0f172a"
                            }}
                          >
                            {act.action?.replace("_", " ") || "EVENT"}
                          </span>

                          <span
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              flex: 1,
                              minWidth: 0
                            }}
                          >
                            {act.details?.filename || act.document_name || `Doc #${act.document_id || "Vault"}`}
                          </span>
                        </div>

                        <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0, whiteSpace: "nowrap" }}>
                          {formatDate(act.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(226, 232, 240, 0.8)" }}>
                <Link
                  to="/activity"
                  className="btn btn-secondary"
                  style={{ width: "100%", justifyContent: "center", borderRadius: "9999px", fontSize: "13px", textDecoration: "none" }}
                >
                  <span>Open Full Activity Trail</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {shareDoc && (
        <ShareModal
          isOpen={Boolean(shareDoc)}
          onClose={() => setShareDoc(null)}
          documentId={shareDoc.id}
          documentName={shareDoc.name}
          onPermissionsUpdated={loadData}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(deleteDoc)}
        onClose={() => setDeleteDoc(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Document from Vault"
        message={`Are you sure you want to permanently delete "${deleteDoc?.name}"? All associated cryptographic keys and discretionary permissions will be revoked.`}
        confirmText="Delete Document"
        confirmVariant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}

export default DashboardPage;
