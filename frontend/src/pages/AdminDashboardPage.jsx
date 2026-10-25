import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetAdminStats,
  apiGetAdminDocuments,
  apiGetAdminComplaints,
  apiGetAuditLogs
} from "../services/api";
import { formatDate, formatFileSize } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Skeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import {
  ShieldAlert,
  Users,
  UserCheck,
  FileText,
  AlertTriangle,
  Inbox,
  KeyRound,
  ArrowRight,
  RotateCcw,
  ShieldCheck,
  UploadCloud,
  CheckCircle2,
  Lock,
  ChevronRight,
  TrendingUp,
  Activity
} from "lucide-react";

export function AdminDashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [stats, setStats] = useState(null);
  const [recentDocs, setRecentDocs] = useState([]);
  const [recentAudit, setRecentAudit] = useState([]);
  const [pendingComplaints, setPendingComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, docsRes, auditRes, complaintsRes] = await Promise.all([
        apiGetAdminStats(),
        apiGetAdminDocuments({}),
        apiGetAuditLogs({ limit: 6, offset: 0 }),
        apiGetAdminComplaints({ status: "Pending" })
      ]);

      setStats(statsRes.stats || null);
      setRecentDocs(docsRes.documents?.slice(0, 5) || []);
      setRecentAudit(auditRes.auditLogs?.slice(0, 5) || []);
      setPendingComplaints(complaintsRes.complaints?.slice(0, 4) || []);
    } catch (err) {
      setError(err.message || "Failed to retrieve administrative statistics.");
      showToast(err.message || "Could not load admin metrics", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
      {/* Page Header */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "clamp(20px, 5vw, 26px)",
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0,
                overflowWrap: "anywhere",
                wordBreak: "break-word"
              }}
            >
              Enterprise Administration Console
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
            Unified system oversight, account roles, cryptographic audit logs, document policies, and complaint management.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            icon={<RotateCcw size={14} />}
          >
            Refresh
          </Button>
          <Link to="/admin/audit" style={{ textDecoration: "none" }}>
            <Button variant="primary" size="sm" icon={<ShieldAlert size={14} />}>
              Security Audit
            </Button>
          </Link>
        </div>
      </div>

      {/* Error / Retry Banner */}
      {error && (
        <div
          role="alert"
          style={{
            padding: "16px 20px",
            borderRadius: "16px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#b91c1c"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <AlertTriangle size={20} />
            <span style={{ fontSize: "13.5px", fontWeight: 600 }}>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div
        className="admin-stats-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "18px"
        }}
      >
        {/* Total Accounts */}
        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Total Accounts
            </span>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(99, 102, 241, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#6366f1" }}>
              <Users size={18} />
            </div>
          </div>
          {loading ? (
            <Skeleton width="60px" height="32px" />
          ) : (
            <div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {stats?.totalAccounts ?? 0}
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <span><strong>{stats?.roleCounts?.admin ?? 0}</strong> Admin</span>
                <span>•</span>
                <span><strong>{stats?.roleCounts?.owner ?? 0}</strong> Owner</span>
                <span>•</span>
                <span><strong>{stats?.roleCounts?.viewer ?? 0}</strong> Viewer</span>
              </div>
            </div>
          )}
        </Card>

        {/* Total Documents */}
        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Vault Documents
            </span>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(14, 165, 233, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#0ea5e9" }}>
              <FileText size={18} />
            </div>
          </div>
          {loading ? (
            <Skeleton width="60px" height="32px" />
          ) : (
            <div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {stats?.totalDocuments ?? 0}
              </div>
              <div style={{ marginTop: "12px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <span><strong>{stats?.recentUploadsCount ?? 0}</strong> uploaded recently</span>
              </div>
            </div>
          )}
        </Card>

        {/* Security & Access Denied */}
        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Security & Denials
            </span>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
              <ShieldAlert size={18} />
            </div>
          </div>
          {loading ? (
            <Skeleton width="60px" height="32px" />
          ) : (
            <div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#dc2626", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {stats?.accessDeniedCount ?? 0}
              </div>
              <div style={{ marginTop: "12px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <span>Across <strong>{stats?.securityEventsCount ?? 0}</strong> recorded security events</span>
              </div>
            </div>
          )}
        </Card>

        {/* Pending Complaints */}
        <Card style={{ padding: "22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              Pending Complaints
            </span>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: "#f59e0b" }}>
              <Inbox size={18} />
            </div>
          </div>
          {loading ? (
            <Skeleton width="60px" height="32px" />
          ) : (
            <div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {stats?.pendingComplaintsCount ?? 0}
              </div>
              <div style={{ marginTop: "12px", fontSize: "11.5px", color: "var(--text-secondary)" }}>
                <Link to="/admin/complaints" style={{ color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
                  Open Support Inbox →
                </Link>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div>
        <h2 style={{ fontSize: "15px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: "12px" }}>
          Administrative Domains
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "14px" }}>
          {[
            {
              to: "/admin/owners",
              title: "Owner Master Data",
              desc: "Onboard, edit, approve & bulk import owners",
              icon: <UserCheck size={18} color="#10b981" />
            },
            {
              to: "/admin/users",
              title: "User & Role Management",
              desc: "Review identities, roles & account status",
              icon: <Users size={18} color="#6366f1" />
            },
            {
              to: "/admin/documents",
              title: "Document Oversight",
              desc: "Search metadata, owners & access rules",
              icon: <FileText size={18} color="#0ea5e9" />
            },
            {
              to: "/admin/permissions",
              title: "Permissions Oversight",
              desc: "Read/Edit grants & corrective change history",
              icon: <KeyRound size={18} color="#8b5cf6" />
            },
            {
              to: "/admin/keys",
              title: "Secret Key Management",
              desc: "Envelope encryption, key rotation & revocation",
              icon: <KeyRound size={18} color="#0284c7" />
            },
            {
              to: "/admin/complaints",
              title: "Complaint Management",
              desc: "Support tickets, resolution notes & history",
              icon: <Inbox size={18} color="#f59e0b" />
            },
            {
              to: "/admin/audit",
              title: "Audit & Security Logs",
              desc: "Immutable logs, actor sessions & outcomes",
              icon: <ShieldAlert size={18} color="#ef4444" />
            }
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <Card
                className="hover-card"
                style={{
                  padding: "18px",
                  height: "100%",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease"
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(15, 23, 42, 0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {item.icon}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {item.title}
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
                    {item.desc}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "12px", fontSize: "12px", fontWeight: 600, color: "var(--brand-primary, #6366f1)" }}>
                  <span>Open Domain</span>
                  <ChevronRight size={14} />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Two-Column Detail View: Recent Uploads & Recent Security Events */}
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
        {/* Recent Document Uploads */}
        <Card className="responsive-page-card" style={{ padding: "22px", borderRadius: "24px", minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileText size={17} color="#0ea5e9" />
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Recent Vault Documents
              </h3>
            </div>
            <Link to="/admin/documents" style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
              View All
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Skeleton height="36px" />
              <Skeleton height="36px" />
              <Skeleton height="36px" />
            </div>
          ) : recentDocs.length === 0 ? (
            <EmptyState
              title="No documents recorded"
              description="Vault contains no uploaded documents yet."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    borderRadius: "12px",
                    background: "rgba(255, 255, 255, 0.6)",
                    border: "1px solid rgba(226, 232, 240, 0.7)"
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1, marginRight: "12px" }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {doc.name}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Owner: {doc.owner_name || doc.owner_email} • {formatFileSize(doc.size_bytes)}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>
                    {formatDate(doc.created_at)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Audit & Security Events */}
        <Card className="responsive-page-card" style={{ padding: "22px", borderRadius: "24px", minWidth: 0, width: "100%", boxSizing: "border-box", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <ShieldAlert size={17} color="#ef4444" />
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
                Recent Security Events
              </h3>
            </div>
            <Link to="/admin/audit" style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600, textDecoration: "none" }}>
              Full Log Portal
            </Link>
          </div>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Skeleton height="36px" />
              <Skeleton height="36px" />
              <Skeleton height="36px" />
            </div>
          ) : recentAudit.length === 0 ? (
            <EmptyState
              title="No security logs"
              description="No audit events recorded in this timeframe."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {recentAudit.map((log) => {
                const isDenied = log.outcome === "denied" || log.outcome === "failure";
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 12px",
                      borderRadius: "12px",
                      background: isDenied ? "rgba(239, 68, 68, 0.06)" : "rgba(255, 255, 255, 0.6)",
                      border: isDenied ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(226, 232, 240, 0.7)"
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1, marginRight: "12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                          {log.action}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "6px",
                            background: isDenied ? "#ef4444" : "#10b981",
                            color: "#ffffff"
                          }}
                        >
                          {log.outcome}
                        </span>
                      </div>
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Actor: {log.actor_name || log.actor_email || `ID #${log.actor_id || "System"}`}
                      </span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", flexShrink: 0 }}>
                      {formatDate(log.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default AdminDashboardPage;
