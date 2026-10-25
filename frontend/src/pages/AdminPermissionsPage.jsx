import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetAdminPermissions,
  apiGetAdminDocuments,
  apiAdminCorrectPermission
} from "../services/api";
import { formatDate } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import {
  KeyRound,
  ShieldAlert,
  Search,
  RotateCcw,
  History,
  ShieldCheck,
  AlertTriangle,
  Lock,
  FileText,
  User,
  Trash2,
  Edit,
  Clock
} from "lucide-react";

export function AdminPermissionsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("grants"); // "grants" | "history"
  const [permissionsMap, setPermissionsMap] = useState({});
  const [documents, setDocuments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Corrective Action Modal
  const [correctiveModal, setCorrectiveModal] = useState(null); // { doc, grant, action: 'revoke' | 'modify' }
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [permRes, docRes] = await Promise.all([
        apiGetAdminPermissions(),
        apiGetAdminDocuments({})
      ]);

      const rawPerms = permRes.permissions;
      const normalizedMap = Array.isArray(rawPerms)
        ? rawPerms.reduce((acc, p) => {
            acc[p.document_id] = acc[p.document_id] || [];
            acc[p.document_id].push(p);
            return acc;
          }, {})
        : (rawPerms || {});
      setPermissionsMap(normalizedMap);
      setHistory(permRes.history || []);
      setDocuments(docRes.documents || []);
    } catch (err) {
      setError(err.message || "Failed to retrieve permissions data.");
      showToast(err.message || "Could not load permissions", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCorrectiveModal = (doc, grant, action) => {
    setCorrectiveModal({ doc, grant, action });
    setReason("");
  };

  const handleExecuteCorrectiveAction = async () => {
    if (!reason || reason.trim().length < 5) {
      showToast("A valid administrative reason (minimum 5 characters) is mandatory.", "error");
      return;
    }

    setSubmitting(true);
    try {
      await apiAdminCorrectPermission({
        documentId: correctiveModal.doc.id,
        userId: correctiveModal.grant.user_id,
        action: correctiveModal.action,
        reason: reason.trim()
      });
      showToast(
        `Corrective action ${correctiveModal.action} recorded successfully in audit trail.`,
        "success"
      );
      setCorrectiveModal(null);
      loadData();
    } catch (err) {
      showToast(err.message || "Failed to execute corrective permission action.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Permissions Oversight & Governance
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Inspect document-level Read/Edit access grants, audit permission lifecycles, and execute justified corrective actions.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} icon={<RotateCcw size={14} />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Security Guidance Alert */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "14px",
          background: "rgba(139, 92, 246, 0.08)",
          border: "1px solid rgba(139, 92, 246, 0.25)",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          fontSize: "12.5px",
          color: "var(--text-primary)",
          lineHeight: 1.5
        }}
      >
        <ShieldAlert size={18} color="#8b5cf6" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong style={{ display: "block", color: "#6d28d9", marginBottom: "2px" }}>
            Administrative Governance Standard (Section 4)
          </strong>
          Silent permission edits and unrestricted access impersonation are prohibited. Any corrective revocation
          or reassignment mandates explicit confirmation and cryptographically auditable reason capture.
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid rgba(226, 232, 240, 0.9)", paddingBottom: "12px" }}>
        <button
          type="button"
          onClick={() => setActiveTab("grants")}
          style={{
            padding: "8px 16px",
            borderRadius: "10px",
            border: "none",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            background: activeTab === "grants" ? "#0f172a" : "transparent",
            color: activeTab === "grants" ? "#ffffff" : "var(--text-secondary)",
            transition: "all 0.15s ease"
          }}
        >
          Active Document Grants
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("history")}
          style={{
            padding: "8px 16px",
            borderRadius: "10px",
            border: "none",
            fontSize: "13px",
            fontWeight: 700,
            cursor: "pointer",
            background: activeTab === "history" ? "#0f172a" : "transparent",
            color: activeTab === "history" ? "#ffffff" : "var(--text-secondary)",
            transition: "all 0.15s ease"
          }}
        >
          Permission Change History ({history.length})
        </button>
      </div>

      {/* TAB 1: ACTIVE GRANTS */}
      {activeTab === "grants" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {loading ? (
            <Card style={{ padding: "20px" }}>
              <TableSkeleton rows={4} cols={5} />
            </Card>
          ) : documents.length === 0 ? (
            <Card style={{ padding: "40px 20px" }}>
              <EmptyState title="No documents found" description="Vault has no documents to inspect." />
            </Card>
          ) : (
            documents.map((doc) => {
              const grants = permissionsMap[doc.id] || [];

              return (
                <Card key={doc.id} style={{ padding: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
                        <FileText size={16} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: "14.5px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                          {doc.name}
                        </h3>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          Owner: <strong>{doc.owner_name}</strong> ({doc.owner_email}) • Category: {doc.category || "General"}
                        </span>
                      </div>
                    </div>

                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
                      {grants.length} Active {grants.length === 1 ? "Grant" : "Grants"}
                    </span>
                  </div>

                  {grants.length === 0 ? (
                    <div style={{ padding: "14px", borderRadius: "10px", background: "rgba(241, 245, 249, 0.6)", fontSize: "12.5px", color: "var(--text-muted)", fontStyle: "italic" }}>
                      No external users have been granted Read or Edit access to this document.
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", textAlign: "left" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(226, 232, 240, 0.8)", color: "var(--text-muted)" }}>
                            <th style={{ padding: "8px 12px", fontWeight: 700 }}>Recipient User</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700 }}>Permission Grant</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700 }}>Granted On</th>
                            <th style={{ padding: "8px 12px", fontWeight: 700, textAlign: "right" }}>Corrective Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grants.map((g) => (
                            <tr key={g.id} style={{ borderBottom: "1px solid rgba(226, 232, 240, 0.5)" }}>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary)" }}>
                                  {g.user_name}
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                  {g.user_email}
                                </span>
                              </td>

                              <td style={{ padding: "10px 12px" }}>
                                <span
                                  style={{
                                    padding: "3px 8px",
                                    borderRadius: "6px",
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    background: g.permission === "edit" ? "rgba(245, 158, 11, 0.1)" : "rgba(99, 102, 241, 0.1)",
                                    color: g.permission === "edit" ? "#d97706" : "#6366f1"
                                  }}
                                >
                                  {g.permission}
                                </span>
                              </td>

                              <td style={{ padding: "10px 12px", color: "var(--text-secondary)" }}>
                                {formatDate(g.created_at)}
                              </td>

                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleOpenCorrectiveModal(doc, g, "revoke")}
                                  icon={<Trash2 size={12} />}
                                >
                                  Revoke Grant
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: CHANGE HISTORY */}
      {activeTab === "history" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {history.length === 0 ? (
            <div style={{ padding: "40px 20px" }}>
              <EmptyState title="No permission history" description="No grants or revocations recorded yet." />
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
                <thead>
                  <tr style={{ background: "rgba(248, 250, 252, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.9)" }}>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Document</th>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Target User</th>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Action / Grant</th>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Authorizing Actor</th>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Reason Justification</th>
                    <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(226, 232, 240, 0.6)" }}>
                      <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {h.documentName}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ display: "block", color: "var(--text-primary)" }}>{h.targetUserName}</span>
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{h.targetUserEmail}</span>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            background: h.action.includes("revoke") ? "rgba(239, 68, 68, 0.1)" : "rgba(16, 185, 129, 0.1)",
                            color: h.action.includes("revoke") ? "#dc2626" : "#059669"
                          }}
                        >
                          {h.action} ({h.permission})
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ display: "block", color: "var(--text-primary)" }}>{h.changedByName}</span>
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{h.changedByEmail}</span>
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)", fontSize: "12px", maxWidth: "260px" }}>
                        {h.reason || "Standard assignment"}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-muted)", fontSize: "12px" }}>
                        {formatDate(h.timestamp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Corrective Action Reason Capture Modal */}
      {correctiveModal && (
        <Modal
          isOpen={true}
          onClose={() => setCorrectiveModal(null)}
          title={`Corrective Administrative Action: ${correctiveModal.action.toUpperCase()}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontSize: "13px",
                lineHeight: 1.5,
                color: "var(--text-primary)"
              }}
            >
              <strong>Target Document:</strong> {correctiveModal.doc.name}<br />
              <strong>Recipient:</strong> {correctiveModal.grant.user_name} ({correctiveModal.grant.user_email})<br />
              <strong>Current Grant:</strong> {correctiveModal.grant.permission?.toUpperCase()}<br />
              <strong>Warning:</strong> This corrective administrative override will immediately revoke the recipient's decryption capability and will be permanently recorded in the immutable enterprise audit trail.
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "6px" }}>
                Mandatory Administrative Reason (Min. 5 characters)
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Detail the operational or security justification for revoking this grant..."
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  fontSize: "13px",
                  outline: "none",
                  fontFamily: "var(--font-body)",
                  background: "rgba(255, 255, 255, 0.9)"
                }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <Button variant="ghost" onClick={() => setCorrectiveModal(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleExecuteCorrectiveAction}
                disabled={submitting || reason.trim().length < 5}
              >
                {submitting ? "Executing..." : "Confirm Corrective Revocation"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminPermissionsPage;
