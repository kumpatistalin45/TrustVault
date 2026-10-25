import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiGetDocuments, apiDownloadDocument } from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { OtpModal } from "../components/common/OtpModal";
import {
  Users,
  Search,
  Download,
  Eye,
  Edit,
  FileText,
  KeyRound,
  ShieldCheck,
  Clock,
  RotateCcw
} from "lucide-react";

export function SharedDocumentsPage() {
  const { user, isOwner, isAdmin } = useAuth();
  const isViewer = !isOwner && !isAdmin;
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [documents, setSharedDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  // OTP Modal
  const [otpDoc, setOtpDoc] = useState(null);
  const [otpLoading, setOtpLoading] = useState(false);

  const fetchSharedDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetDocuments();
      // Filter out documents owned by the current employee
      const list = (res.documents || []).filter(
        (d) => String(d.owner_id) !== String(user?.id) && d.access_level !== "owner"
      );
      setSharedDocs(list);
    } catch (err) {
      showToast("Error loading shared documents", "error");
      setSharedDocs([]);
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    fetchSharedDocs();
  }, [fetchSharedDocs]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.category && d.category.toLowerCase().includes(q)) ||
        (d.owner_name && d.owner_name.toLowerCase().includes(q))
    );
  }, [documents, searchQuery]);

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

  const handleOtpVerify = (code) => {
    setOtpLoading(true);
    setTimeout(() => {
      setOtpLoading(false);
      showToast(`Passcode accepted. Unlocked "${otpDoc?.name}"`, "success");
      setOtpDoc(null);
      if (otpDoc?.id) navigate(`/documents/${otpDoc.id}`);
    }, 800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Page Header */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "32px",
            fontWeight: 700,
            color: "var(--text-primary)",
            letterSpacing: "-0.03em",
            margin: "0 0 6px 0"
          }}
        >
          Shared With Me
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0, fontWeight: 500 }}>
          Confidential files shared with your employee identity by authorized team members.
        </p>
      </div>

      {/* Search Bar (Frosted Glass) */}
      <div
        className="frosted-panel"
        style={{
          padding: "14px 20px",
          borderRadius: "24px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Search
            size={15}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            placeholder="Search shared files by name, category, or owner..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-control"
            style={{
              paddingLeft: "38px",
              paddingTop: "9px",
              paddingBottom: "9px",
              fontSize: "13px",
              borderRadius: "9999px",
              background: "rgba(255, 255, 255, 0.8)"
            }}
          />
        </div>

        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--text-muted)", fontSize: "12.5px", borderRadius: "9999px" }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Shared Documents List Table */}
      {loading ? (
        <div className="card">
          <TableSkeleton rows={4} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: "60px 24px" }}>
          <EmptyState
            title="No documents shared with you"
            description="When colleagues grant you read or edit access to their encrypted files, they will appear in this repository."
            actionText="Go to My Vault"
            onAction={() => navigate("/documents")}
          />
        </div>
      ) : (
        <div className="table-container">
          <table className="vault-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Category</th>
                <th>File Size</th>
                <th>Shared By</th>
                <th>Granted Permission</th>
                <th>Shared Date</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const canEdit = doc.access_level === "edit";
                return (
                  <tr key={doc.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "8px",
                            background: "#eef2ff",
                            color: "#4f46e5",
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
                              fontSize: "11px",
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)"
                            }}
                          >
                            #{doc.id} • AES-256-GCM
                          </span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span
                        style={{
                          fontSize: "12px",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          background: "#f1f5f9",
                          color: "var(--text-secondary)",
                          fontWeight: 500
                        }}
                      >
                        {doc.category || "General"}
                      </span>
                    </td>

                    <td style={{ fontSize: "12.5px", fontFamily: "var(--font-mono)" }}>
                      {formatFileSize(doc.size_bytes)}
                    </td>

                    <td>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {doc.owner_name || "Colleague"}
                      </span>
                    </td>

                    <td>
                      <Badge variant={doc.access_level === "edit" ? "edit" : "read"} size="sm" />
                    </td>

                    <td style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                      {formatDate(doc.created_at)}
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                        {!isViewer && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            loading={downloadingId === doc.id}
                            icon={<Download size={13} />}
                          >
                            Download
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOtpDoc(doc)}
                          title="OTP Unlock"
                          icon={<KeyRound size={14} color="#6366f1" />}
                        />

                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/documents/${doc.id}/edit`)}
                            title="Edit Metadata"
                            icon={<Edit size={14} color="#d97706" />}
                          />
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                          title="Details"
                          icon={<Eye size={14} />}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* OTP Unlock Modal */}
      {otpDoc && (
        <OtpModal
          isOpen={Boolean(otpDoc)}
          onClose={() => setOtpDoc(null)}
          documentTitle={otpDoc.name}
          onVerify={handleOtpVerify}
          loading={otpLoading}
        />
      )}
    </div>
  );
}

export default SharedDocumentsPage;
