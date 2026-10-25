import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useTemporaryAccess } from "../context/TemporaryAccessContext";
import {
  apiGetDocuments,
  apiDownloadDocument,
  apiPreviewDocument,
  apiUnlockDocument,
  apiDeleteDocument,
  apiUpdateDocument
} from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { OtpModal } from "../components/common/OtpModal";
import { ShareModal } from "../components/common/ShareModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { Modal } from "../components/common/Modal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { DocumentViewerModal } from "../components/common/DocumentViewerModal";
import {
  FileText,
  Search,
  Download,
  Eye,
  KeyRound,
  LayoutGrid,
  List,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpDown,
  Clock,
  UploadCloud,
  Share2,
  Trash2,
  Edit3,
  SlidersHorizontal,
  ShieldCheck,
  Save,
  AlertCircle
} from "lucide-react";

export function DocumentsPage() {
  const { user, isOwner, isAdmin } = useAuth();
  const { showToast } = useToast();
  const { startAccess, remainingSeconds, endAccess } = useTemporaryAccess();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("list"); // "list" or "grid"

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all"); // "all", "owned", "shared"
  const [sortBy, setSortBy] = useState("newest"); // "newest", "oldest", "name", "size"

  // In-App Document Viewer State (Viewers - Zero Downloads)
  const [activeViewerDoc, setActiveViewerDoc] = useState(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState(null);
  const [viewerMimeType, setViewerMimeType] = useState(null);
  const [isViewerUnlocked, setIsViewerUnlocked] = useState(false);
  const [viewerUnlockLoading, setViewerUnlockLoading] = useState(false);
  const [viewerUnlockError, setViewerUnlockError] = useState(null);

  // Download & OTP Verification States (for Owner/Admin)
  const [downloadingId, setDownloadingId] = useState(null);
  const [otpDoc, setOtpDoc] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);

  // Owner Management Modal States
  const [shareDoc, setShareDoc] = useState(null);
  const [deleteDoc, setDeleteDoc] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Inline Quick Rename/Edit Metadata Modal State
  const [editDoc, setEditDoc] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetDocuments();
      let docs = res.documents || [];
      // If viewer, only show documents that were explicitly assigned to them (never show raw unassigned owner files)
      if (!isOwner && !isAdmin) {
        docs = docs.filter((d) => d.access_level === "read" || d.access_level === "edit");
      }
      setDocuments(docs);
    } catch (err) {
      showToast(err.message || "Failed to load documents", "error");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [isOwner, isAdmin, showToast]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Read URL search param if present
  useEffect(() => {
    const query = searchParams.get("search");
    if (query !== null) setSearchQuery(query);
  }, [searchParams]);

  // Filtered & Sorted Documents
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    // Ownership scope filter (for owners / admins)
    if (scopeFilter === "owned") {
      result = result.filter(
        (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
      );
    } else if (scopeFilter === "shared") {
      result = result.filter(
        (d) => String(d.owner_id) !== String(user?.id) && d.access_level !== "owner"
      );
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.category && d.category.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== "all") {
      result = result.filter(
        (d) => (d.category || "General").toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
      if (sortBy === "oldest") {
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "size") {
        return (Number(b.size_bytes) || 0) - (Number(a.size_bytes) || 0);
      }
      return 0;
    });

    return result;
  }, [documents, scopeFilter, searchQuery, selectedCategory, sortBy, user]);

  // Extract unique categories
  const categories = useMemo(() => {
    const set = new Set();
    documents.forEach((d) => {
      if (d.category) set.add(d.category);
    });
    return Array.from(set);
  }, [documents]);

  // In-App Document Viewing (View-only for Viewers, Zero Downloads)
  const openDocumentViewer = async (doc) => {
    setActiveViewerDoc(doc);
    setViewerUnlockError(null);

    const requiresKey = Boolean(doc.secret_key_hash || doc.timer_enabled || doc.requires_otp);
    if (requiresKey) {
      setIsViewerUnlocked(false);
      setViewerBlobUrl(null);
      setViewerMimeType(null);
    } else {
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

  const handleViewerUnlockSubmit = async (key) => {
    if (!activeViewerDoc) return;
    setViewerUnlockLoading(true);
    setViewerUnlockError(null);
    try {
      await apiUnlockDocument(activeViewerDoc.id, key);
      const previewRes = await apiPreviewDocument(activeViewerDoc.id);
      setViewerBlobUrl(previewRes.blobUrl);
      setViewerMimeType(previewRes.mimeType);
      setIsViewerUnlocked(true);

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

  // Secure download trigger (Owner/Admin only)
  const handleInitiateDownload = (doc) => {
    if (downloadingId === doc.id) return;
    // If doc is owned or doesn't require OTP, download directly
    const isDocOwner = Boolean(isOwner && (String(doc.owner_id) === String(user?.id) || doc.access_level === "owner"));
    if (isDocOwner || (!doc.requiresOtp && doc.category !== "Security" && doc.category !== "Finance")) {
      executeDownload(doc);
    } else {
      setOtpDoc(doc);
      setOtpError(null);
    }
  };

  const executeDownload = async (doc) => {
    setDownloadingId(doc.id);
    try {
      const res = await apiDownloadDocument(doc.id, doc.name, doc);
      if (res?.blobUrl) {
        startAccess(doc, res.blobUrl, res.blob);
      }
      showToast(`Decrypted and downloaded "${doc.name}".`, "success");
    } catch (err) {
      showToast(err.message || "Failed to download document", "error");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleOtpVerify = async (_code) => {
    if (!otpDoc) return;
    setOtpLoading(true);
    setOtpError(null);
    try {
      await new Promise((r) => setTimeout(r, 500));
      const targetDoc = otpDoc;
      setOtpDoc(null);
      await executeDownload(targetDoc);
    } catch (err) {
      setOtpError(err.message || "Invalid or expired verification key. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  // Delete Document Handler
  const handleDeleteConfirm = async () => {
    if (!deleteDoc) return;
    setDeleteLoading(true);
    try {
      await apiDeleteDocument(deleteDoc.id);
      showToast(`Document "${deleteDoc.name}" deleted successfully.`, "success");
      setDeleteDoc(null);
      await fetchDocuments();
    } catch (err) {
      showToast(err.message || "Failed to delete document", "error");
    } finally {
      setDeleteLoading(false);
    }
  };

  // Open Quick Edit Modal
  const openEditModal = (doc) => {
    setEditDoc(doc);
    setEditName(doc.name);
    setEditCategory(doc.category || "General");
    setEditError("");
  };

  // Save Quick Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editName.trim()) {
      setEditError("Document title cannot be blank.");
      return;
    }
    setEditLoading(true);
    setEditError("");
    try {
      await apiUpdateDocument(editDoc.id, {
        name: editName.trim(),
        category: editCategory.trim() || undefined
      });
      showToast(`Updated "${editName.trim()}" successfully.`, "success");
      setEditDoc(null);
      await fetchDocuments();
    } catch (err) {
      setEditError(err.message || "Failed to update document metadata.");
    } finally {
      setEditLoading(false);
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setScopeFilter("all");
    setSortBy("newest");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Top Header: Title & Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "30px",
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.02em",
              margin: 0,
              lineHeight: 1.2
            }}
          >
            {isOwner ? "My Documents & Vault" : `Welcome, ${user?.name || "Employee"}`}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "14.5px", margin: "4px 0 0 0" }}>
            {isOwner
              ? `Manage and protect documents owned by your account • ${filteredDocuments.length} of ${documents.length} available`
              : filteredDocuments.length === 0
              ? `No assigned documents available for your account • 0 of 0 ready`
              : `Admin-assigned documents available for your account • ${filteredDocuments.length} of ${documents.length} ready`}
          </p>
        </div>

        {/* Action Pills & View Mode Switcher */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {(isOwner || isAdmin) && (
            <Link
              to="/documents/upload"
              className="btn btn-primary btn-sm"
              style={{
                borderRadius: "9999px",
                gap: "7px",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.08)"
              }}
            >
              <UploadCloud size={15} />
              <span>Upload Document</span>
            </Link>
          )}

          {!isOwner && (
            <Link
              to="/history"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                fontSize: "12.5px",
                fontWeight: 600,
                color: "#0f172a",
                background: "rgba(255, 255, 255, 0.7)",
                backdropFilter: "blur(12px)",
                padding: "7px 16px",
                borderRadius: "9999px",
                border: "1px solid rgba(255, 255, 255, 0.9)",
                textDecoration: "none",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)"
              }}
            >
              <Clock size={14} />
              <span>Download History</span>
            </Link>
          )}

          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.6)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255, 255, 255, 0.8)",
              borderRadius: "9999px",
              padding: "3px"
            }}
          >
            <button
              onClick={() => setViewMode("grid")}
              style={{
                background: viewMode === "grid" ? "#ffffff" : "transparent",
                border: "none",
                color: viewMode === "grid" ? "#0f172a" : "var(--text-muted)",
                padding: "6px 12px",
                borderRadius: "9999px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                boxShadow: viewMode === "grid" ? "0 2px 8px rgba(15, 23, 42, 0.06)" : "none",
                transition: "all 0.15s ease"
              }}
              title="Card Grid View"
              aria-label="Card Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              style={{
                background: viewMode === "list" ? "#ffffff" : "transparent",
                border: "none",
                color: viewMode === "list" ? "#0f172a" : "var(--text-muted)",
                padding: "6px 12px",
                borderRadius: "9999px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                boxShadow: viewMode === "list" ? "0 2px 8px rgba(15, 23, 42, 0.06)" : "none",
                transition: "all 0.15s ease"
              }}
              title="Table List View"
              aria-label="Table List View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Scope Filter Tabs for Owner */}
      {(isOwner || isAdmin) && (
        <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "12px" }}>
          <button
            onClick={() => setScopeFilter("all")}
            className={`nav-pill ${scopeFilter === "all" ? "active" : ""}`}
          >
            All Documents ({documents.length})
          </button>
          <button
            onClick={() => setScopeFilter("owned")}
            className={`nav-pill ${scopeFilter === "owned" ? "active" : ""}`}
          >
            Owned by Me ({documents.filter((d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner").length})
          </button>
          <button
            onClick={() => setScopeFilter("shared")}
            className={`nav-pill ${scopeFilter === "shared" ? "active" : ""}`}
          >
            Shared with Me ({documents.filter((d) => String(d.owner_id) !== String(user?.id) && d.access_level !== "owner").length})
          </button>
        </div>
      )}

      {/* Filter and Search Control Bar */}
      <div
        className="frosted-panel"
        style={{
          padding: "14px 20px",
          borderRadius: "24px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px"
        }}
      >
        {/* Search input */}
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            placeholder="Search by document name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 14px 8px 38px",
              fontSize: "13px",
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              borderRadius: "9999px",
              color: "var(--text-primary)",
              outline: "none"
            }}
          />
        </div>

        {/* Category Filter Pills */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <button
            onClick={() => setSelectedCategory("all")}
            style={{
              border: "none",
              background: selectedCategory === "all" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: selectedCategory === "all" ? "#ffffff" : "var(--text-secondary)",
              padding: "6px 14px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                border: "none",
                background: selectedCategory === cat ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
                color: selectedCategory === cat ? "#ffffff" : "var(--text-secondary)",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease"
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Sort selector */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <ArrowUpDown size={14} color="var(--text-muted)" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: "6px 12px",
              fontSize: "12.5px",
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              borderRadius: "9999px",
              color: "var(--text-secondary)",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="name">Alphabetical</option>
            <option value="size">File Size</option>
          </select>
        </div>

        {/* Reset Filters */}
        {(searchQuery || selectedCategory !== "all" || scopeFilter !== "all" || sortBy !== "newest") && (
          <button
            onClick={handleResetFilters}
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--text-muted)", fontSize: "12px", gap: "5px", borderRadius: "9999px" }}
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}
      </div>

      {/* Main Documents Content (List or Grid) */}
      {loading ? (
        <div className="card-white" style={{ padding: "32px", borderRadius: "24px" }}>
          <TableSkeleton rows={5} />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="card-white" style={{ padding: "64px 24px", textAlign: "center", borderRadius: "28px" }}>
          <EmptyState
            title={!isOwner && !isAdmin ? "No recent documents found" : "No documents available"}
            description={
              searchQuery || selectedCategory !== "all" || scopeFilter !== "all"
                ? "No files match your current search criteria. Try resetting the filters."
                : isOwner
                ? "You have not uploaded any files yet. Upload your first document to get started."
                : "No files have been assigned to your employee account yet. Once an administrator or owner assigns a document to you, it will appear here."
            }
            actionText={
              searchQuery || selectedCategory !== "all" || scopeFilter !== "all"
                ? "Reset Filters"
                : isOwner
                ? "Upload First Document"
                : undefined
            }
            onAction={
              searchQuery || selectedCategory !== "all" || scopeFilter !== "all"
                ? handleResetFilters
                : isOwner
                ? () => navigate("/documents/upload")
                : undefined
            }
          />
        </div>
      ) : viewMode === "list" ? (
        /* TABLE LIST VIEW */
        <div className="table-container" style={{ borderRadius: "24px" }}>
          <table className="vault-table">
            <thead>
              <tr>
                <th>Document Name & Identifier</th>
                <th>Classification</th>
                <th>File Size</th>
                <th>Availability Date</th>
                <th>Ownership</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((doc) => {
                const isDownloading = downloadingId === doc.id;
                const isDocOwner = Boolean(isOwner && (String(doc.owner_id) === String(user?.id) || doc.access_level === "owner"));

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
                          <FileText size={18} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <Link
                            to={`/documents/${doc.id}`}
                            className="truncate-filename"
                            title={doc.name}
                            style={{
                              fontSize: "14px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              textDecoration: "none"
                            }}
                          >
                            {doc.name}
                          </Link>
                          <span
                            style={{
                              display: "block",
                              fontSize: "11.5px",
                              color: "var(--text-muted)"
                            }}
                          >
                            ID #{doc.id} • {doc.owner_name || "Owner"}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: "12px",
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

                    <td style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
                      {formatFileSize(doc.size_bytes)}
                    </td>

                    <td style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                      {formatDate(doc.created_at)}
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          textTransform: "uppercase",
                          background: isDocOwner ? "rgba(15, 23, 42, 0.08)" : "rgba(79, 70, 229, 0.1)",
                          color: isDocOwner ? "#0f172a" : "#4f46e5"
                        }}
                      >
                        {isDocOwner ? "Owner" : doc.access_level === "edit" ? "Can Edit" : "Can Read"}
                      </span>
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        {/* In-App View button - for Viewers (No downloads) */}
                        {!isOwner && !isAdmin && (
                          <button
                            onClick={() => openDocumentViewer(doc)}
                            className="btn-primary"
                            style={{
                              padding: "7px 14px",
                              fontSize: "12px",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px"
                            }}
                            title="View Document"
                            aria-label={`View ${doc.name}`}
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                        )}

                        {/* Owner Management Actions - strictly guarded: viewers never see edit, manage, or delete */}
                        {isOwner && isDocOwner && (
                          <>
                            <button
                              onClick={() => setShareDoc(doc)}
                              className="btn-circle"
                              style={{ width: "32px", height: "32px" }}
                              title="Manage Permissions"
                              aria-label={`Share ${doc.name}`}
                            >
                              <Share2 size={13} />
                            </button>

                            <button
                              onClick={() => openEditModal(doc)}
                              className="btn-circle"
                              style={{ width: "32px", height: "32px" }}
                              title="Edit Metadata"
                              aria-label={`Edit ${doc.name}`}
                            >
                              <Edit3 size={13} />
                            </button>

                            <button
                              onClick={() => setDeleteDoc(doc)}
                              className="btn-circle"
                              style={{ width: "32px", height: "32px", color: "#dc2626", borderColor: "rgba(220, 38, 38, 0.2)" }}
                              title="Delete Document"
                              aria-label={`Delete ${doc.name}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* CARD GRID VIEW */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: "20px"
          }}
        >
          {filteredDocuments.map((doc) => {
            const isDownloading = downloadingId === doc.id;
            const isDocOwner = Boolean(isOwner && (String(doc.owner_id) === String(user?.id) || doc.access_level === "owner"));

            return (
              <div
                key={doc.id}
                className="card-white card-white-hover"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: "24px",
                  borderRadius: "24px"
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: "14px"
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "14px",
                        background: "rgba(15, 23, 42, 0.05)",
                        color: "#0f172a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      <FileText size={20} />
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span
                        style={{
                          fontSize: "10.5px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          textTransform: "uppercase",
                          background: isDocOwner ? "rgba(15, 23, 42, 0.08)" : "rgba(79, 70, 229, 0.1)",
                          color: isDocOwner ? "#0f172a" : "#4f46e5"
                        }}
                      >
                        {isDocOwner ? "Owner" : doc.access_level === "edit" ? "Can Edit" : "Can Read"}
                      </span>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          background: "rgba(15, 23, 42, 0.05)",
                          color: "var(--text-secondary)"
                        }}
                      >
                        {doc.category || "General"}
                      </span>
                    </div>
                  </div>

                  <Link
                    to={`/documents/${doc.id}`}
                    style={{ textDecoration: "none" }}
                  >
                    <h3
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "16px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        margin: "0 0 6px 0",
                        lineHeight: 1.3
                      }}
                    >
                      {doc.name}
                    </h3>
                  </Link>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "16px"
                    }}
                  >
                    <span>{formatDate(doc.created_at)}</span>
                    <span>•</span>
                    <span style={{ fontFamily: "var(--font-mono)" }}>
                      {formatFileSize(doc.size_bytes)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(226, 232, 240, 0.8)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between"
                  }}
                >
                  {!isOwner && !isAdmin && (
                    <button
                      onClick={() => openDocumentViewer(doc)}
                      className="btn-primary"
                      style={{
                        padding: "8px 16px",
                        fontSize: "12px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "5px"
                      }}
                      title="View Document"
                      aria-label={`View ${doc.name}`}
                    >
                      <Eye size={13} />
                      <span>View</span>
                    </button>
                  )}

                  {isOwner && isDocOwner && (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        onClick={() => setShareDoc(doc)}
                        className="btn-circle"
                        style={{ width: "32px", height: "32px" }}
                        title="Manage Permissions"
                        aria-label={`Share ${doc.name}`}
                      >
                        <Share2 size={13} />
                      </button>

                      <button
                        onClick={() => openEditModal(doc)}
                        className="btn-circle"
                        style={{ width: "32px", height: "32px" }}
                        title="Edit Metadata"
                        aria-label={`Edit ${doc.name}`}
                      >
                        <Edit3 size={13} />
                      </button>

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
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Share Modal */}
      {shareDoc && (
        <ShareModal
          isOpen={Boolean(shareDoc)}
          onClose={() => setShareDoc(null)}
          documentId={shareDoc.id}
          documentName={shareDoc.name}
          onPermissionsUpdated={fetchDocuments}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDialog
        isOpen={Boolean(deleteDoc)}
        onClose={() => setDeleteDoc(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Vault Document"
        message={`Are you sure you want to permanently delete "${deleteDoc?.name}"? All associated cryptographic keys and discretionary permissions will be revoked.`}
        confirmText="Delete Document"
        confirmVariant="danger"
        loading={deleteLoading}
      />

      {/* Quick Edit Metadata Modal */}
      {editDoc && (
        <Modal
          isOpen={Boolean(editDoc)}
          onClose={() => setEditDoc(null)}
          title={`Edit Metadata: ${editDoc.name}`}
          maxWidth="500px"
        >
          <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {editError && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "#fef2f2",
                  color: "#dc2626",
                  fontSize: "12.5px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <AlertCircle size={15} />
                <span>{editError}</span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="edit-modal-name" className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                Document Title
              </label>
              <input
                id="edit-modal-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="form-control"
                style={{ borderRadius: "12px" }}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="edit-modal-category" className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                Classification Category
              </label>
              <input
                id="edit-modal-category"
                type="text"
                placeholder="e.g. Engineering, Finance, Security"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="form-control"
                style={{ borderRadius: "12px" }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditDoc(null)}
                disabled={editLoading}
                style={{ fontSize: "13px", padding: "8px 16px" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={editLoading}
                style={{ fontSize: "13px", padding: "8px 20px", display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <Save size={14} />
                <span>{editLoading ? "Saving..." : "Save Changes"}</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Required Document Unlock Email OTP Modal */}
      {otpDoc && (
        <OtpModal
          isOpen={Boolean(otpDoc)}
          onClose={() => {
            setOtpDoc(null);
            setOtpError(null);
          }}
          documentTitle={otpDoc.name}
          titleText="A verification key has been sent to your email."
          supportingText="Enter the code sent to your email to continue."
          buttonText="Verify & Unlock"
          onVerify={handleOtpVerify}
          loading={otpLoading}
          error={otpError}
        />
      )}

      {/* In-App Document Viewer Modal (View-Only, Zero Downloads) */}
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
    </div>
  );
}

export default DocumentsPage;
