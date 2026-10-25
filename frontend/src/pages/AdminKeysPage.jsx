import React, { useState, useEffect } from "react";
import {
  KeyRound,
  Shield,
  ShieldCheck,
  ShieldAlert,
  RotateCw,
  Ban,
  Plus,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Clock,
  Layers,
  Lock,
  ArrowRight,
  Info,
  History
} from "lucide-react";
import {
  apiGetAdminKeys,
  apiGetAdminKeyDetails,
  apiGenerateAdminKey,
  apiRotateAdminKey,
  apiRevokeAdminKey
} from "../services/api";
import { Modal } from "../components/common/Modal";
import { StatusBadge } from "../components/common/StatusBadge";
import { formatFileSize } from "../services/mockData";

export default function AdminKeysPage() {
  const [keys, setKeys] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [stats, setStats] = useState({
    totalKeys: 0,
    activeKeys: 0,
    rotatedKeys: 0,
    revokedKeys: 0,
    protectedDocuments: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals state
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({ name: "", scope: "document", confirm: false });
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState(null);

  const [rotateModalKey, setRotateModalKey] = useState(null);
  const [rotateConfirm, setRotateConfirm] = useState(false);
  const [rotateLoading, setRotateLoading] = useState(false);
  const [rotateError, setRotateError] = useState(null);

  const [revokeModalKey, setRevokeModalKey] = useState(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [revokeError, setRevokeError] = useState(null);

  const [detailsKey, setDetailsKey] = useState(null);
  const [detailsDocs, setDetailsDocs] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const [notification, setNotification] = useState(null);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const data = await apiGetAdminKeys();
      setKeys(data.keys || []);
      setAuditEvents(data.auditEvents || []);
      setStats(data.stats || {
        totalKeys: (data.keys || []).length,
        activeKeys: (data.keys || []).filter((k) => k.status === "active").length,
        rotatedKeys: (data.keys || []).filter((k) => k.status === "rotated").length,
        revokedKeys: (data.keys || []).filter((k) => k.status === "revoked").length,
        protectedDocuments: (data.keys || []).reduce((sum, k) => sum + (k.document_count || 0), 0)
      });
    } catch (err) {
      setNotification({ type: "error", message: err.message || "Failed to load encryption keys" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleOpenGenerate = () => {
    setGenerateForm({ name: "", scope: "document", confirm: false });
    setGenerateError(null);
    setIsGenerateModalOpen(true);
  };

  const handleGenerateSubmit = async (e) => {
    e.preventDefault();
    if (!generateForm.name.trim()) {
      setGenerateError("Please enter a key name.");
      return;
    }
    if (!generateForm.confirm) {
      setGenerateError("Please confirm key generation.");
      return;
    }

    try {
      setGenerateLoading(true);
      setGenerateError(null);
      await apiGenerateAdminKey({
        name: generateForm.name.trim(),
        scope: generateForm.scope
      });
      setIsGenerateModalOpen(false);
      setNotification({ type: "success", message: `Encryption key "${generateForm.name}" generated successfully.` });
      await loadKeys();
    } catch (err) {
      setGenerateError(err.message || "Failed to generate key");
    } finally {
      setGenerateLoading(false);
    }
  };

  const handleOpenRotate = (key) => {
    setRotateModalKey(key);
    setRotateConfirm(false);
    setRotateError(null);
  };

  const handleRotateSubmit = async (e) => {
    e.preventDefault();
    if (!rotateConfirm) {
      setRotateError("Please confirm key rotation.");
      return;
    }

    try {
      setRotateLoading(true);
      setRotateError(null);
      const res = await apiRotateAdminKey(rotateModalKey.id);
      setRotateModalKey(null);
      setNotification({
        type: "success",
        message: `Key ${rotateModalKey.id} rotated successfully. ${res.rewrappedCount || 0} document DEKs rewrapped.`
      });
      await loadKeys();
    } catch (err) {
      setRotateError(err.message || "Failed to rotate key");
    } finally {
      setRotateLoading(false);
    }
  };

  const handleOpenRevoke = (key) => {
    setRevokeModalKey(key);
    setRevokeReason("");
    setRevokeConfirm(false);
    setRevokeError(null);
  };

  const handleRevokeSubmit = async (e) => {
    e.preventDefault();
    if (!revokeConfirm) {
      setRevokeError("Please confirm key revocation.");
      return;
    }

    try {
      setRevokeLoading(true);
      setRevokeError(null);
      await apiRevokeAdminKey(revokeModalKey.id, revokeReason);
      setRevokeModalKey(null);
      setNotification({ type: "success", message: `Key ${revokeModalKey.id} has been revoked.` });
      await loadKeys();
    } catch (err) {
      setRevokeError(err.message || "Failed to revoke key");
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleViewDetails = async (key) => {
    setDetailsKey(key);
    setDetailsDocs([]);
    setDetailsLoading(true);
    try {
      const data = await apiGetAdminKeyDetails(key.id);
      setDetailsDocs(data.documents || []);
    } catch (_e) {
      setDetailsDocs([]);
    } finally {
      setDetailsLoading(false);
    }
  };

  const filteredKeys = keys.filter((key) => {
    const matchesSearch =
      (key.id || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (key.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (key.scope || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || key.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div style={{ padding: "28px", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "24px",
          flexWrap: "wrap",
          gap: "16px"
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.25)"
              }}
            >
              <KeyRound size={22} />
            </div>
            <div>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "24px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  margin: 0
                }}
              >
                Secret Key Management
              </h1>
              <p style={{ margin: 0, fontSize: "13.5px", color: "var(--text-secondary)" }}>
                Cryptographic Envelope Encryption &bull; AES-256-GCM &bull; Key Lifecycle &amp; Access Controls
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            id="admin-generate-key-btn"
            onClick={handleOpenGenerate}
            className="btn btn-primary"
            style={{
              borderRadius: "9999px",
              padding: "10px 22px",
              fontSize: "13.5px",
              fontWeight: 700,
              gap: "8px",
              boxShadow: "0 4px 14px rgba(2, 132, 199, 0.25)"
            }}
          >
            <Plus size={16} />
            <span>Generate Document Key</span>
          </button>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          style={{
            padding: "12px 18px",
            borderRadius: "14px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: notification.type === "error" ? "#fef2f2" : "#f0fdf4",
            border: notification.type === "error" ? "1px solid #fecaca" : "1px solid #bbf7d0",
            color: notification.type === "error" ? "#991b1b" : "#166534",
            fontSize: "13.5px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {notification.type === "error" ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", fontWeight: 700 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px"
        }}
      >
        <div className="card" style={{ padding: "18px 20px", borderRadius: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Active Keys
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(22, 101, 52, 0.1)", color: "#166534", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={18} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#166534", fontFamily: "var(--font-heading)" }}>
            {stats.activeKeys}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Ready for document encryption
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px", borderRadius: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Protected Docs
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(2, 132, 199, 0.1)", color: "#0284c7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={18} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#0284c7", fontFamily: "var(--font-heading)" }}>
            {stats.protectedDocuments}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Envelopes in private storage
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px", borderRadius: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Rotated Keys
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(217, 119, 6, 0.1)", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <RotateCw size={18} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#d97706", fontFamily: "var(--font-heading)" }}>
            {stats.rotatedKeys}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Legacy unwrapping preserved
          </div>
        </div>

        <div className="card" style={{ padding: "18px 20px", borderRadius: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
              Revoked Keys
            </span>
            <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Ban size={18} />
            </div>
          </div>
          <div style={{ fontSize: "28px", fontWeight: 800, color: "#dc2626", fontFamily: "var(--font-heading)" }}>
            {stats.revokedKeys}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Access permanently blocked
          </div>
        </div>
      </div>

      {/* Security Architecture Callout */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(2, 132, 199, 0.04) 100%)",
          border: "1px solid rgba(14, 165, 233, 0.25)",
          borderRadius: "16px",
          padding: "16px 20px",
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          gap: "14px"
        }}
      >
        <ShieldCheck size={26} color="#0284c7" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: "12.5px", color: "var(--text-primary)", lineHeight: 1.5 }}>
          <strong>Zero Plaintext Key Exposure:</strong> TrustVault uses envelope encryption (AES-256-GCM). Each document receives a unique 256-bit Data Encryption Key (DEK). DEKs are wrapped at rest under server-side Key Encryption Keys (KEKs). Raw key material is never written to logs, browser storage, or audit trails.
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          padding: "14px 18px",
          borderRadius: "16px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "240px" }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            placeholder="Search key ID, name, or scope..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: "none",
              outline: "none",
              width: "100%",
              background: "transparent",
              fontSize: "13.5px"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {["all", "active", "rotated", "revoked"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              style={{
                border: "none",
                background: statusFilter === status ? "#0284c7" : "rgba(241, 245, 249, 0.8)",
                color: statusFilter === status ? "#ffffff" : "var(--text-secondary)",
                padding: "6px 14px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s ease"
              }}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Keys Table */}
      <div className="card" style={{ borderRadius: "18px", overflow: "hidden", marginBottom: "30px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(248, 250, 252, 0.95)", borderBottom: "1px solid rgba(226, 232, 240, 0.8)" }}>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Key Identifier
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Name &amp; Scope
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Algorithm
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Status
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Protected Docs
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Created At
                </th>
                <th style={{ padding: "14px 20px", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", textAlign: "right" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    Loading cryptographic keys...
                  </td>
                </tr>
              ) : filteredKeys.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
                    No encryption keys match the criteria.
                  </td>
                </tr>
              ) : (
                filteredKeys.map((key) => {
                  const isActive = key.status === "active";
                  const isRotated = key.status === "rotated";
                  const isRevoked = key.status === "revoked";

                  return (
                    <tr
                      key={key.id}
                      style={{
                        borderBottom: "1px solid rgba(241, 245, 249, 0.8)",
                        transition: "background 0.15s ease"
                      }}
                    >
                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <KeyRound size={16} color={isActive ? "#0284c7" : isRotated ? "#d97706" : "#dc2626"} />
                          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: "13px", color: "var(--text-primary)" }}>
                            {key.id}
                          </span>
                        </div>
                      </td>

                      <td style={{ padding: "16px 20px" }}>
                        <div style={{ fontWeight: 700, fontSize: "13.5px", color: "var(--text-primary)" }}>
                          {key.name}
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "capitalize" }}>
                          Scope: {key.scope || "document"}
                        </div>
                      </td>

                      <td style={{ padding: "16px 20px" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "12px",
                            padding: "3px 8px",
                            background: "rgba(241, 245, 249, 0.8)",
                            borderRadius: "6px",
                            border: "1px solid rgba(226, 232, 240, 0.8)"
                          }}
                        >
                          {key.algorithm || "AES-256-GCM"}
                        </span>
                      </td>

                      <td style={{ padding: "16px 20px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "9999px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.03em",
                            background: isActive ? "#f0fdf4" : isRotated ? "#fffbeb" : "#fef2f2",
                            color: isActive ? "#166534" : isRotated ? "#b45309" : "#991b1b",
                            border: isActive ? "1px solid #bbf7d0" : isRotated ? "1px solid #fde68a" : "1px solid #fecaca"
                          }}
                        >
                          {key.status}
                        </span>
                      </td>

                      <td style={{ padding: "16px 20px" }}>
                        <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "13px" }}>
                          {key.document_count || 0}
                        </span>{" "}
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>files</span>
                      </td>

                      <td style={{ padding: "16px 20px", fontSize: "12.5px", color: "var(--text-secondary)" }}>
                        {key.created_at ? new Date(key.created_at).toLocaleDateString() : "—"}
                      </td>

                      <td style={{ padding: "16px 20px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                          <button
                            onClick={() => handleViewDetails(key)}
                            className="btn btn-secondary"
                            style={{ padding: "5px 12px", fontSize: "12px", borderRadius: "9999px" }}
                            title="View protected documents"
                          >
                            Details
                          </button>

                          {isActive && (
                            <button
                              onClick={() => handleOpenRotate(key)}
                              className="btn btn-secondary"
                              style={{ padding: "5px 12px", fontSize: "12px", borderRadius: "9999px", color: "#b45309" }}
                              title="Rotate key and rewrap DEKs"
                            >
                              <RotateCw size={13} style={{ marginRight: "4px" }} />
                              Rotate
                            </button>
                          )}

                          {!isRevoked && (
                            <button
                              onClick={() => handleOpenRevoke(key)}
                              className="btn btn-secondary"
                              style={{ padding: "5px 12px", fontSize: "12px", borderRadius: "9999px", color: "#dc2626" }}
                              title="Revoke key access"
                            >
                              <Ban size={13} style={{ marginRight: "4px" }} />
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Key Lifecycle Audit Trail */}
      <div className="card" style={{ padding: "22px 24px", borderRadius: "18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
          <History size={18} color="#0284c7" />
          <h2 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Cryptographic Audit History
          </h2>
        </div>
        <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "0 0 16px 0" }}>
          Verifiable audit trail tracking key generation, rotation, revocation, and authorized viewer key-release events.
        </p>

        {auditEvents.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
            No key lifecycle audit events recorded yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {auditEvents.slice(0, 10).map((evt) => (
              <div
                key={evt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: "rgba(248, 250, 252, 0.7)",
                  border: "1px solid rgba(226, 232, 240, 0.7)",
                  fontSize: "12.5px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      background: evt.action === "key_generation" ? "rgba(14, 165, 233, 0.1)" : evt.action === "key_rotation" ? "rgba(217, 119, 6, 0.1)" : evt.action === "key_revocation" ? "rgba(220, 38, 38, 0.1)" : "rgba(22, 101, 52, 0.1)",
                      color: evt.action === "key_generation" ? "#0284c7" : evt.action === "key_rotation" ? "#b45309" : evt.action === "key_revocation" ? "#dc2626" : "#166534"
                    }}
                  >
                    {evt.action.replace("_", " ")}
                  </span>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {evt.details?.keyId || `Key ID: ${evt.document_id || "System"}`}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>
                    by {evt.actor_email || "System"}
                  </span>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "11.5px" }}>
                  {new Date(evt.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Generate Key */}
      <Modal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        title="Generate Document Encryption Key"
        maxWidth="500px"
      >
        <form onSubmit={handleGenerateSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Key Name / Description
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Master Document Key 2026"
              value={generateForm.name}
              onChange={(e) => setGenerateForm({ ...generateForm, name: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                background: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                marginTop: "6px",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Key Scope
            </label>
            <select
              value={generateForm.scope}
              onChange={(e) => setGenerateForm({ ...generateForm, scope: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                background: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                marginTop: "6px",
                boxSizing: "border-box"
              }}
            >
              <option value="document">Document (Default)</option>
              <option value="finance">Finance Department</option>
              <option value="legal">Legal &amp; Compliance</option>
              <option value="executive">Executive &amp; Board</option>
            </select>
          </div>

          <div
            style={{
              padding: "12px 14px",
              background: "rgba(14, 165, 233, 0.08)",
              border: "1px solid rgba(14, 165, 233, 0.2)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#0369a1",
              lineHeight: 1.45
            }}
          >
            <strong>Cryptographic Spec:</strong> Generates a 256-bit AES key via Node.js <code>crypto.randomBytes(32)</code>. The key is wrapped by the server Key Encryption Key (KEK) using AES-256-GCM. Raw keys are never shown.
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <input
              type="checkbox"
              id="confirm-generate-key"
              checked={generateForm.confirm}
              onChange={(e) => setGenerateForm({ ...generateForm, confirm: e.target.checked })}
              style={{ marginTop: "3px" }}
            />
            <label htmlFor="confirm-generate-key" style={{ fontSize: "12.5px", color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.4 }}>
              I explicitly confirm the generation and provisioning of this cryptographic key.
            </label>
          </div>

          {generateError && (
            <div style={{ color: "#dc2626", fontSize: "12.5px", padding: "8px 12px", background: "#fef2f2", borderRadius: "8px" }}>
              {generateError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setIsGenerateModalOpen(false)}
              className="btn btn-secondary"
              style={{ borderRadius: "9999px", padding: "8px 18px", fontSize: "13px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={generateLoading || !generateForm.confirm || !generateForm.name.trim()}
              className="btn btn-primary"
              style={{ borderRadius: "9999px", padding: "8px 22px", fontSize: "13px" }}
            >
              {generateLoading ? "Generating..." : "Generate Key"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Rotate Key */}
      <Modal
        isOpen={Boolean(rotateModalKey)}
        onClose={() => setRotateModalKey(null)}
        title={`Rotate Key: ${rotateModalKey?.id}`}
        maxWidth="500px"
      >
        <form onSubmit={handleRotateSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
            Rotating <strong>{rotateModalKey?.name}</strong> will create a new active key and rewrap all document Data Encryption Keys (DEKs) safely under the new key.
          </p>

          <div
            style={{
              padding: "12px 14px",
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#92400e",
              lineHeight: 1.45
            }}
          >
            <strong>Backward Compatibility Notice:</strong> Existing documents secured with this key remain fully decryptable without data loss. Re-wrapping is performed transactionally.
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <input
              type="checkbox"
              id="confirm-rotate-key"
              checked={rotateConfirm}
              onChange={(e) => setRotateConfirm(e.target.checked)}
              style={{ marginTop: "3px" }}
            />
            <label htmlFor="confirm-rotate-key" style={{ fontSize: "12.5px", color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.4 }}>
              I confirm rotation of key <strong>{rotateModalKey?.id}</strong>.
            </label>
          </div>

          {rotateError && (
            <div style={{ color: "#dc2626", fontSize: "12.5px", padding: "8px 12px", background: "#fef2f2", borderRadius: "8px" }}>
              {rotateError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setRotateModalKey(null)}
              className="btn btn-secondary"
              style={{ borderRadius: "9999px", padding: "8px 18px", fontSize: "13px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={rotateLoading || !rotateConfirm}
              className="btn btn-primary"
              style={{ borderRadius: "9999px", padding: "8px 22px", fontSize: "13px", background: "#d97706" }}
            >
              {rotateLoading ? "Rotating..." : "Rotate Key"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Revoke Key */}
      <Modal
        isOpen={Boolean(revokeModalKey)}
        onClose={() => setRevokeModalKey(null)}
        title={`Revoke Key: ${revokeModalKey?.id}`}
        maxWidth="500px"
      >
        <form onSubmit={handleRevokeSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "12px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "12px",
              fontSize: "12.5px",
              color: "#991b1b",
              lineHeight: 1.45
            }}
          >
            <strong>Warning (Destructive Action):</strong> Revoking this key immediately prevents any viewer or owner from releasing or unwrapping decryption material for documents secured by this key.
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Reason for Revocation
            </label>
            <input
              type="text"
              placeholder="e.g. Key retirement, security compromise, scheduled decommission"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                background: "#f8fafc",
                fontSize: "14px",
                outline: "none",
                marginTop: "6px",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <input
              type="checkbox"
              id="confirm-revoke-key"
              checked={revokeConfirm}
              onChange={(e) => setRevokeConfirm(e.target.checked)}
              style={{ marginTop: "3px" }}
            />
            <label htmlFor="confirm-revoke-key" style={{ fontSize: "12.5px", color: "var(--text-primary)", cursor: "pointer", lineHeight: 1.4 }}>
              I understand that revoking key <strong>{revokeModalKey?.id}</strong> is immediate and denies subsequent document access.
            </label>
          </div>

          {revokeError && (
            <div style={{ color: "#dc2626", fontSize: "12.5px", padding: "8px 12px", background: "#fef2f2", borderRadius: "8px" }}>
              {revokeError}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              onClick={() => setRevokeModalKey(null)}
              className="btn btn-secondary"
              style={{ borderRadius: "9999px", padding: "8px 18px", fontSize: "13px" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={revokeLoading || !revokeConfirm}
              className="btn btn-primary"
              style={{ borderRadius: "9999px", padding: "8px 22px", fontSize: "13px", background: "#dc2626" }}
            >
              {revokeLoading ? "Revoking..." : "Revoke Key"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Key Details & Documents */}
      <Modal
        isOpen={Boolean(detailsKey)}
        onClose={() => setDetailsKey(null)}
        title={`Key Details: ${detailsKey?.id}`}
        maxWidth="680px"
      >
        {detailsKey && (
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                padding: "16px",
                background: "rgba(248, 250, 252, 0.9)",
                borderRadius: "14px",
                border: "1px solid rgba(226, 232, 240, 0.8)",
                fontSize: "13px"
              }}
            >
              <div><strong>Name:</strong> {detailsKey.name}</div>
              <div><strong>Algorithm:</strong> {detailsKey.algorithm}</div>
              <div><strong>Scope:</strong> {detailsKey.scope}</div>
              <div><strong>Status:</strong> {detailsKey.status}</div>
              <div><strong>Created By:</strong> {detailsKey.created_by_email || "System"}</div>
              <div><strong>Created At:</strong> {new Date(detailsKey.created_at).toLocaleString()}</div>
            </div>

            <h4 style={{ fontSize: "14px", fontWeight: 700, margin: "0" }}>
              Documents Protected Under This Key ({detailsDocs.length})
            </h4>

            {detailsLoading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)" }}>
                Loading associated documents...
              </div>
            ) : detailsDocs.length === 0 ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "12.5px" }}>
                No documents currently assigned to this key ID.
              </div>
            ) : (
              <div style={{ maxHeight: "260px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {detailsDocs.map((doc) => (
                  <div
                    key={doc.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "#f8fafc",
                      borderRadius: "10px",
                      border: "1px solid rgba(226, 232, 240, 0.7)",
                      fontSize: "12.5px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <FileText size={16} color="#0284c7" />
                      <span style={{ fontWeight: 600 }}>{doc.name}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "11.5px" }}>
                        ({formatFileSize(doc.size_bytes)})
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      v{doc.encryption_version} &bull; {new Date(doc.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setDetailsKey(null)}
                className="btn btn-secondary"
                style={{ borderRadius: "9999px", padding: "8px 20px" }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
