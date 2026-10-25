import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTemporaryAccess } from "../context/TemporaryAccessContext";
import {
  apiGetDocuments,
  apiPreviewDocument,
  apiUnlockDocument,
  apiGetDownloadHistory
} from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { OtpModal } from "../components/common/OtpModal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { DocumentViewerModal } from "../components/common/DocumentViewerModal";
import {
  FileText,
  Eye,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Search,
  RotateCcw,
  KeyRound,
  Shield,
  Lock,
  ChevronRight,
  ArrowRight,
  AlertTriangle,
  Info
} from "lucide-react";

export function ViewerDashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { startAccess, remainingSeconds, endAccess } = useTemporaryAccess();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // In-App Document Viewer State (Restricted View, Zero Downloads)
  const [activeViewerDoc, setActiveViewerDoc] = useState(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState(null);
  const [viewerMimeType, setViewerMimeType] = useState(null);
  const [isViewerUnlocked, setIsViewerUnlocked] = useState(false);
  const [viewerUnlockLoading, setViewerUnlockLoading] = useState(false);
  const [viewerUnlockError, setViewerUnlockError] = useState(null);

  // Legacy OTP Modal support (if needed)
  const [otpDoc, setOtpDoc] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [docsRes, histRes] = await Promise.all([
        apiGetDocuments({ limit: 100 }),
        apiGetDownloadHistory().catch(() => ({ downloads: [] }))
      ]);

      setDocuments(docsRes?.documents || []);
      setDownloadHistory(histRes?.downloads || []);
    } catch (err) {
      console.error("Viewer dashboard load error:", err);
      setError(err.message || "Failed to load assigned documents. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Open Document Viewer Flow
  const openDocumentViewer = async (doc) => {
    setActiveViewerDoc(doc);
    setViewerUnlockError(null);

    // If doc has a secret key or timer enabled, prompt for access key
    const requiresKey = Boolean(doc.secret_key_hash || doc.timer_enabled || doc.requires_otp);
    if (requiresKey) {
      setIsViewerUnlocked(false);
      setViewerBlobUrl(null);
      setViewerMimeType(null);
    } else {
      // Direct in-app preview without secret key
      setViewerUnlockLoading(true);
      try {
        const previewRes = await apiPreviewDocument(doc.id);
        setViewerBlobUrl(previewRes.blobUrl);
        setViewerMimeType(previewRes.mimeType);
        setIsViewerUnlocked(true);
        startAccess(
          doc,
          previewRes.blobUrl,
          previewRes.blob,
          (doc.timer_duration_minutes || 5) * 60
        );
      } catch (err) {
        setViewerUnlockError(err.message || "Failed to load document preview.");
        setIsViewerUnlocked(false);
      } finally {
        setViewerUnlockLoading(false);
      }
    }
  };

  // Validate Access Key & Fetch Preview
  const handleViewerUnlockSubmit = async (key) => {
    if (!activeViewerDoc) return;
    setViewerUnlockLoading(true);
    setViewerUnlockError(null);
    try {
      // 1. Validate key via existing secure backend unlock endpoint
      await apiUnlockDocument(activeViewerDoc.id, key);

      // 2. Fetch decrypted document preview stream (inline, no-store)
      const previewRes = await apiPreviewDocument(activeViewerDoc.id);
      setViewerBlobUrl(previewRes.blobUrl);
      setViewerMimeType(previewRes.mimeType);
      setIsViewerUnlocked(true);

      // 3. Start temporary access countdown timer
      const timerMins = activeViewerDoc.timer_duration_minutes || 5;
      startAccess(
        activeViewerDoc,
        previewRes.blobUrl,
        previewRes.blob,
        timerMins * 60
      );

      showToast(`Key accepted! ${timerMins}-minute access timer started.`, "success");
    } catch (err) {
      setViewerUnlockError(err.message || "Invalid access key / passphrase. Please try again.");
    } finally {
      setViewerUnlockLoading(false);
    }
  };

  const closeDocumentViewer = () => {
    setActiveViewerDoc(null);
    setViewerBlobUrl(null);
    setViewerMimeType(null);
    setIsViewerUnlocked(false);
    setViewerUnlockError(null);
  };

  // Filtered documents
  const filteredDocs = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        !searchQuery.trim() ||
        doc.name.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
        (doc.category && doc.category.toLowerCase().includes(searchQuery.trim().toLowerCase()));

      const matchesCat =
        categoryFilter === "all" ||
        (doc.category && doc.category.toLowerCase() === categoryFilter.toLowerCase());

      return matchesSearch && matchesCat;
    });
  }, [documents, searchQuery, categoryFilter]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set();
    documents.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    return Array.from(set);
  }, [documents]);

  const todayDateString = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      {/* Top Header: Viewer Banner + Actions */}
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
                background: "rgba(14, 165, 233, 0.12)",
                color: "#0369a1",
                padding: "3px 10px",
                borderRadius: "9999px"
              }}
            >
              Viewer Access Portal
            </span>
            <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>• {todayDateString}</span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "clamp(22px, 5.5vw, 30px)",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
              margin: 0,
              lineHeight: 1.2,
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            Welcome, {user?.name || "Viewer"}
          </h1>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Decentralized document viewer • Access and decrypt documents authorized by document owners.
          </p>
        </div>

        {/* Top Right Action Button */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ borderRadius: "9999px", gap: "6px" }}
            title="Refresh Assigned Documents"
            aria-label="Refresh Vault Data"
          >
            <RotateCcw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>
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

      {/* Metric Statistics Grid (4 Cards) */}
      <div className="owner-stats-grid">
        {/* 1. Accessible Documents */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Assigned Documents
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(14, 165, 233, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
              <FileText size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {loading ? "..." : documents.length}
          </span>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
            Granted by document owners
          </div>
        </div>

        {/* 2. Viewable Documents */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Viewable Documents
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
              <Eye size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {loading ? "..." : documents.length}
          </span>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
            Authorized for in-app viewing
          </div>
        </div>

        {/* 3. Viewing Activity */}
        <div className="owner-stat-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Audited Views
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#4f46e5" }}>
              <CheckCircle2 size={14} />
            </div>
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontSize: "24px", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1.1 }}>
            {loading ? "..." : downloadHistory.length}
          </span>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
            Audited access events
          </div>
        </div>

        {/* 4. Envelope Cipher Standard */}
        <div className="owner-stat-card span-2-mobile">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Envelope Cipher
            </span>
            <div style={{ width: "26px", height: "26px", borderRadius: "8px", background: "rgba(5, 150, 105, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
              <ShieldCheck size={14} />
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#065f46", background: "rgba(5, 150, 105, 0.12)", padding: "2px 8px", borderRadius: "6px" }}>
              AES-256-GCM
            </span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
              TVE1 Header
            </span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
            Zero-knowledge client decryption
          </div>
        </div>
      </div>

      {/* Main Section: Assigned Documents */}
      <div className="card-white responsive-page-card" style={{ padding: "24px 28px", borderRadius: "24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "12px",
            marginBottom: "20px"
          }}
        >
          <div>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Documents Assigned to You
            </h2>
            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
              Showing {filteredDocs.length} of {documents.length} accessible documents
            </p>
          </div>

          <Link
            to="/documents"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--brand-primary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <span>View Full Library ({documents.length})</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Filter / Search Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "20px",
            flexWrap: "wrap"
          }}
        >
          <div
            style={{
              flex: "1 1 200px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "12px",
              padding: "8px 14px"
            }}
          >
            <Search size={15} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search assigned documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                fontSize: "13px",
                width: "100%",
                color: "var(--text-primary)"
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: "var(--text-muted)"
                }}
              >
                Clear
              </button>
            )}
          </div>

          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                borderRadius: "12px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                background: "rgba(248, 250, 252, 0.8)",
                color: "var(--text-primary)",
                outline: "none"
              }}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {/* Document List */}
        {loading ? (
          <TableSkeleton rows={4} cols={4} />
        ) : filteredDocs.length === 0 ? (
          <EmptyState
            title={searchQuery || categoryFilter !== "all" ? "No matching documents" : "No recent documents found"}
            description={
              searchQuery || categoryFilter !== "all"
                ? "No documents match your search criteria. Try resetting the filters."
                : "You currently have no documents assigned by document owners. When an owner grants you permission, your documents will appear here."
            }
            icon={FileText}
          />
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-view">
              <div style={{ overflowX: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Document</th>
                      <th>Category</th>
                      <th>Size</th>
                      <th>Assigned Date</th>
                      <th style={{ textAlign: "right" }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => {
                      return (
                        <tr key={doc.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "10px",
                                  background: "rgba(14, 165, 233, 0.08)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  color: "#0284c7"
                                }}
                              >
                                <FileText size={18} />
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
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                  Owner: {doc.owner_name || "Document Owner"}
                                </div>
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
                            <button
                              onClick={() => openDocumentViewer(doc)}
                              className="btn btn-primary btn-sm"
                              style={{ borderRadius: "9999px", gap: "6px" }}
                              title="View Document"
                              aria-label={`View ${doc.name}`}
                            >
                              <Eye size={13} />
                              <span>View</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Document Cards List (Clean Responsive Cards) */}
            <div className="mobile-doc-cards" style={{ display: "none", flexDirection: "column", gap: "10px" }}>
              {filteredDocs.map((doc) => {
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
                          background: "rgba(14, 165, 233, 0.08)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                          color: "#0284c7"
                        }}
                      >
                        <FileText size={18} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link
                          to={`/documents/${doc.id}`}
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
                      <button
                        onClick={() => openDocumentViewer(doc)}
                        className="btn btn-primary btn-sm"
                        style={{ borderRadius: "9999px", gap: "6px" }}
                        title="View Document"
                        aria-label={`View ${doc.name}`}
                      >
                        <Eye size={13} />
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Recent Access Activity Section */}
      <div className="card-white responsive-page-card" style={{ padding: "24px 28px", borderRadius: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(16, 185, 129, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#059669" }}>
              <Clock size={16} />
            </div>
            <div>
              <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Recent Viewing Activity
              </h2>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Audited client-side document viewing events
              </span>
            </div>
          </div>

          <Link
            to="/history"
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "var(--brand-primary)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px"
            }}
          >
            <span>View Full History</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {downloadHistory.length === 0 ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No viewing activity recorded yet. When you view an assigned document, your audited decryption record will show here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {downloadHistory.slice(0, 4).map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(248, 250, 252, 0.7)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  fontSize: "13px",
                  gap: "10px",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: 1 }}>
                  <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.document_name || item.documentName || `Document #${item.document_id || item.documentId || "101"}`}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "9999px", background: "rgba(16, 185, 129, 0.12)", color: "#065f46", fontWeight: 600 }}>
                    Decrypted & Viewed
                  </span>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {formatDate(item.downloaded_at || item.downloadedAt || item.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* In-App Document Viewer Modal (Strictly View-Only) */}
      <DocumentViewerModal
        isOpen={Boolean(activeViewerDoc)}
        onClose={closeDocumentViewer}
        document={activeViewerDoc}
        blobUrl={viewerBlobUrl}
        mimeType={viewerMimeType}
        isUnlocked={isViewerUnlocked}
        onUnlockSubmit={handleViewerUnlockSubmit}
        unlockLoading={viewerUnlockLoading}
        unlockError={viewerUnlockError}
        remainingSeconds={remainingSeconds}
        onEndAccess={() => {
          endAccess("manual");
          closeDocumentViewer();
        }}
      />

      {/* OTP Passcode Modal if document is high security */}
      {otpDoc && (
        <OtpModal
          documentTitle={otpDoc.name}
          isOpen={!!otpDoc}
          onClose={() => {
            setOtpDoc(null);
            setOtpError(null);
          }}
          onVerify={handleOtpVerify}
          loading={otpLoading}
          error={otpError}
        />
      )}
    </div>
  );
}

export default ViewerDashboardPage;
