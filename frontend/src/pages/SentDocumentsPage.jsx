import React, { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetDocuments,
  apiGetPermissions,
  apiRevokePermission
} from "../services/api";
import { formatDate } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { ShareModal } from "../components/common/ShareModal";
import {
  Send,
  Trash2,
  Share2,
  FileText,
  User,
  ShieldCheck,
  Search,
  ExternalLink,
  Lock
} from "lucide-react";

export function SentDocumentsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [shares, setShares] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // New share modal state
  const [selectedDocForShare, setSelectedDocForShare] = useState(null);

  const fetchSentShares = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGetDocuments();
      const ownedDocs = (res.documents || []).filter(
        (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
      );

      // Concurrently fetch permissions for each owned document
      const sharesList = [];
      await Promise.all(
        ownedDocs.map(async (doc) => {
          try {
            const pRes = await apiGetPermissions(doc.id);
            if (pRes.permissions && pRes.permissions.length > 0) {
              pRes.permissions.forEach((p) => {
                sharesList.push({
                  permissionId: p.id,
                  documentId: doc.id,
                  documentName: doc.name,
                  category: doc.category || "General",
                  userId: p.user_id,
                  userName: p.user_name || "Colleague",
                  userEmail: p.user_email,
                  permission: p.permission,
                  createdAt: p.created_at
                });
              });
            }
          } catch (_e) {
            // Ignore if doc permission fetch fails
          }
        })
      );

      setShares(sharesList);
    } catch (err) {
      console.warn("Could not load sent document shares:", err.message);
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSentShares();
  }, [fetchSentShares]);

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await apiRevokePermission(revokeTarget.documentId, revokeTarget.userId);
      showToast(
        `Revoked access to "${revokeTarget.documentName}" for ${revokeTarget.userEmail}`,
        "success"
      );
      setRevokeTarget(null);
      await fetchSentShares();
    } catch (err) {
      showToast(err.message || "Failed to revoke permission", "error");
    } finally {
      setRevokeLoading(false);
    }
  };

  const filteredShares = shares.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.documentName.toLowerCase().includes(q) ||
      s.userName.toLowerCase().includes(q) ||
      s.userEmail.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });

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
          Sent Documents & Outbound Sharing
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0, fontWeight: 500 }}>
          Manage discretionary access granted to team members for documents you own.
        </p>
      </div>

      {/* Filter & Search Bar (Frosted Glass) */}
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
            placeholder="Search by document title, recipient name or email..."
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

      {/* Outbound Shares Table */}
      {loading ? (
        <div className="card">
          <TableSkeleton rows={4} />
        </div>
      ) : filteredShares.length === 0 ? (
        <div className="card" style={{ padding: "60px 24px" }}>
          <EmptyState
            title="No outbound document shares"
            description={
              searchQuery
                ? "No active shares match your search filter."
                : "You haven't shared any of your personal vault files with colleagues yet."
            }
            actionText="Go to My Vault to Share"
            onAction={() => navigate("/documents")}
          />
        </div>
      ) : (
        <div className="table-container">
          <table className="vault-table">
            <thead>
              <tr>
                <th>Shared Document</th>
                <th>Category</th>
                <th>Recipient Employee</th>
                <th>Granted Permission</th>
                <th>Date Granted</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShares.map((s, idx) => (
                <tr key={`${s.documentId}-${s.userId}-${idx}`}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "8px",
                          background: "#eff6ff",
                          color: "#2563eb",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0
                        }}
                      >
                        <FileText size={16} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <Link
                          to={`/documents/${s.documentId}`}
                          className="truncate-filename"
                          title={s.documentName}
                          style={{
                            fontSize: "13.5px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            textDecoration: "none"
                          }}
                        >
                          {s.documentName}
                        </Link>
                        <span
                          style={{
                            display: "block",
                            fontSize: "11px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)"
                          }}
                        >
                          Doc ID: #{s.documentId}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      style={{
                        fontSize: "12px",
                        padding: "2px 8px",
                        borderRadius: "12px",
                        background: "#f1f5f9",
                        color: "var(--text-secondary)",
                        fontWeight: 500
                      }}
                    >
                      {s.category}
                    </span>
                  </td>

                  <td>
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {s.userName}
                      </span>
                      <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>
                        {s.userEmail}
                      </span>
                    </div>
                  </td>

                  <td>
                    <Badge variant={s.permission === "edit" ? "edit" : "read"} size="sm" />
                  </td>

                  <td style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
                    {formatDate(s.createdAt)}
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setRevokeTarget(s)}
                        title="Immediately Revoke Access"
                        icon={<Trash2 size={13} />}
                      >
                        Revoke Access
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revocation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevokeConfirm}
        title="Revoke Granted Permission"
        message={`Are you sure you want to revoke access to "${revokeTarget?.documentName}" for ${revokeTarget?.userEmail}? They will immediately lose decryption privileges.`}
        confirmText="Revoke Access"
        confirmVariant="danger"
        loading={revokeLoading}
      />
    </div>
  );
}

export default SentDocumentsPage;
