import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { apiGetOwnerActivity, apiGetAuditLogs } from "../services/api";
import { formatDate } from "../services/mockData";
import { EmptyState } from "../components/common/EmptyState";
import { TableSkeleton } from "../components/common/Skeleton";
import {
  Activity,
  UploadCloud,
  Download,
  Share2,
  Trash2,
  Lock,
  ShieldCheck,
  ShieldAlert,
  FileText,
  User,
  Filter,
  Info,
  RotateCcw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Edit3
} from "lucide-react";

export function ActivityPage() {
  const { user, isOwner, isAdmin } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterOutcome, setFilterOutcome] = useState("all");

  const loadActivity = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isAdmin) {
        // Admin gets organization-wide logs
        const res = await apiGetAuditLogs({ limit: 100 });
        const rawLogs = res.logs || res.auditLogs || [];
        setEvents(rawLogs);
      } else {
        // Owner gets owner-scoped document activity
        const res = await apiGetOwnerActivity({ limit: 100 });
        const rawLogs = res.activity || res.logs || [];
        setEvents(rawLogs);
      }
    } catch (err) {
      console.warn("Could not load activity records:", err.message);
      setError(err.message || "Failed to load activity logs from vault.");
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  // Client-side filtering
  const filteredEvents = useMemo(() => {
    let result = [...events];

    // Filter by action category
    if (filterAction !== "all") {
      result = result.filter((e) => {
        const act = (e.action || "").toLowerCase();
        if (filterAction === "uploads") return act.includes("upload");
        if (filterAction === "updates") return act.includes("update") || act.includes("edit");
        if (filterAction === "access") return act.includes("download") || act.includes("read");
        if (filterAction === "permissions") return act.includes("permission") || act.includes("grant") || act.includes("revoke");
        if (filterAction === "deletions") return act.includes("delete");
        return true;
      });
    }

    // Filter by outcome
    if (filterOutcome !== "all") {
      result = result.filter((e) => {
        const out = (e.outcome || "").toLowerCase();
        if (filterOutcome === "success") return out === "success";
        if (filterOutcome === "denied") return out === "denied" || out === "failure";
        return true;
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((e) => {
        const docName = e.details?.filename || e.document_name || String(e.document_id || "");
        const actor = e.actor_name || e.actor_email || "";
        return docName.toLowerCase().includes(q) || actor.toLowerCase().includes(q) || (e.action || "").toLowerCase().includes(q);
      });
    }

    return result;
  }, [events, filterAction, filterOutcome, searchQuery]);

  const getActionBadge = (action) => {
    const act = (action || "").toLowerCase();
    if (act.includes("upload")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(37, 99, 235, 0.1)", color: "#2563eb", textTransform: "uppercase" }}>
          UPLOAD
        </span>
      );
    }
    if (act.includes("update") || act.includes("edit")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(217, 119, 6, 0.1)", color: "#d97706", textTransform: "uppercase" }}>
          UPDATE
        </span>
      );
    }
    if (act.includes("download") || act.includes("read")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(5, 150, 105, 0.1)", color: "#059669", textTransform: "uppercase" }}>
          DOWNLOAD
        </span>
      );
    }
    if (act.includes("grant") || act.includes("share")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(79, 70, 229, 0.1)", color: "#4f46e5", textTransform: "uppercase" }}>
          GRANT
        </span>
      );
    }
    if (act.includes("revoke")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", textTransform: "uppercase" }}>
          REVOKE
        </span>
      );
    }
    if (act.includes("delete")) {
      return (
        <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(220, 38, 38, 0.1)", color: "#dc2626", textTransform: "uppercase" }}>
          DELETE
        </span>
      );
    }
    return (
      <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: "rgba(15, 23, 42, 0.08)", color: "#0f172a", textTransform: "uppercase" }}>
        {action.toUpperCase()}
      </span>
    );
  };

  const getActionIcon = (action) => {
    const act = (action || "").toLowerCase();
    if (act.includes("upload")) return <UploadCloud size={16} color="#2563eb" />;
    if (act.includes("update") || act.includes("edit")) return <Edit3 size={16} color="#d97706" />;
    if (act.includes("download") || act.includes("read")) return <Download size={16} color="#059669" />;
    if (act.includes("grant") || act.includes("share")) return <Share2 size={16} color="#4f46e5" />;
    if (act.includes("revoke")) return <Trash2 size={16} color="#dc2626" />;
    if (act.includes("delete")) return <Trash2 size={16} color="#dc2626" />;
    return <Activity size={16} color="#0f172a" />;
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setFilterAction("all");
    setFilterOutcome("all");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }} className="animate-fade-in">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
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
            Document Activity
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", margin: 0, fontWeight: 500 }}>
            Read-only chronological audit trail of document lifecycle operations and access events.
          </p>
        </div>

        <button
          onClick={loadActivity}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          style={{ borderRadius: "9999px", gap: "6px" }}
          title="Refresh Activity Log"
        >
          <RotateCcw size={13} className={loading ? "animate-spin" : ""} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Compliance / Boundary Notice */}
      <div
        className="frosted-panel"
        style={{
          padding: "16px 20px",
          borderRadius: "20px",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <Info size={18} color="#0f172a" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.5, fontWeight: 500 }}>
          {isAdmin
            ? "Compliance Administrator Stream: Viewing organization-wide tamper-evident audit logs directly from PostgreSQL."
            : "Owner Visibility: Displaying verified document lifecycle events (uploads, metadata edits, downloads, and permission grants/revocations) for documents in your vault."}
          {" "}All audit records are strictly immutable and read-only.
        </span>
      </div>

      {/* Filter and Search Bar */}
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
        {/* Search Input */}
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search
            size={14}
            color="var(--text-muted)"
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
          />
          <input
            type="text"
            placeholder="Search by document or actor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "7px 14px 7px 36px",
              fontSize: "12.5px",
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              borderRadius: "9999px",
              color: "var(--text-primary)",
              outline: "none"
            }}
          />
        </div>

        {/* Action Category Filter Buttons */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterAction("all")}
            style={{
              border: "none",
              background: filterAction === "all" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "all" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            All Actions
          </button>
          <button
            onClick={() => setFilterAction("uploads")}
            style={{
              border: "none",
              background: filterAction === "uploads" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "uploads" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            Uploads
          </button>
          <button
            onClick={() => setFilterAction("updates")}
            style={{
              border: "none",
              background: filterAction === "updates" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "updates" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            Updates
          </button>
          <button
            onClick={() => setFilterAction("access")}
            style={{
              border: "none",
              background: filterAction === "access" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "access" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            Downloads
          </button>
          <button
            onClick={() => setFilterAction("permissions")}
            style={{
              border: "none",
              background: filterAction === "permissions" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "permissions" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            Permissions
          </button>
          <button
            onClick={() => setFilterAction("deletions")}
            style={{
              border: "none",
              background: filterAction === "deletions" ? "#0f172a" : "rgba(255, 255, 255, 0.65)",
              color: filterAction === "deletions" ? "#ffffff" : "var(--text-secondary)",
              padding: "5px 12px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            Deletions
          </button>
        </div>

        {/* Outcome Selector */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          <select
            value={filterOutcome}
            onChange={(e) => setFilterOutcome(e.target.value)}
            style={{
              padding: "5px 12px",
              fontSize: "12px",
              background: "rgba(255, 255, 255, 0.75)",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              borderRadius: "9999px",
              color: "var(--text-secondary)",
              outline: "none",
              cursor: "pointer"
            }}
          >
            <option value="all">All Outcomes</option>
            <option value="success">Success Only</option>
            <option value="denied">Denied / Failure Only</option>
          </select>

          {(searchQuery || filterAction !== "all" || filterOutcome !== "all") && (
            <button
              onClick={handleResetFilters}
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--text-muted)", fontSize: "12px", gap: "4px", borderRadius: "9999px" }}
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Activity Timeline List */}
      {loading ? (
        <div className="card-white" style={{ padding: "36px", borderRadius: "28px" }}>
          <TableSkeleton rows={5} />
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card-white" style={{ padding: "64px 24px", textAlign: "center", borderRadius: "28px" }}>
          <EmptyState
            title="No activity events recorded"
            description={
              searchQuery || filterAction !== "all" || filterOutcome !== "all"
                ? "No audit records match your current filter criteria."
                : "No operations on your documents have been recorded yet."
            }
            actionText={searchQuery || filterAction !== "all" || filterOutcome !== "all" ? "Reset Filters" : undefined}
            onAction={searchQuery || filterAction !== "all" || filterOutcome !== "all" ? handleResetFilters : undefined}
          />
        </div>
      ) : (
        <div className="card-white" style={{ padding: "24px", borderRadius: "28px" }}>
          <div className="table-container" style={{ borderRadius: "20px" }}>
            <table className="vault-table">
              <thead>
                <tr>
                  <th>Event Type</th>
                  <th>Target Document</th>
                  <th>Initiator (Actor)</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: "right" }}>Result / Outcome</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map((event, idx) => {
                  const docTitle =
                    event.details?.filename ||
                    event.document_name ||
                    (event.document_id ? `Document #${event.document_id}` : "Vault Repository");
                  const actor = event.actor_name || event.actor_email || `User #${event.actor_id || "System"}`;
                  const outcome = (event.outcome || "success").toLowerCase();

                  return (
                    <tr key={event.id || idx}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "10px",
                              background: "rgba(15, 23, 42, 0.05)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0
                            }}
                          >
                            {getActionIcon(event.action)}
                          </div>
                          {getActionBadge(event.action)}
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                          {docTitle}
                        </span>
                        {event.details?.category && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                            Category: {event.details.category}
                          </span>
                        )}
                        {event.details?.reason && (
                          <span style={{ fontSize: "11px", color: "#dc2626" }}>
                            {event.details.reason}
                          </span>
                        )}
                      </td>

                      <td>
                        <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>
                          {actor}
                        </span>
                      </td>

                      <td style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {formatDate(event.created_at || event.timestamp)}
                      </td>

                      <td style={{ textAlign: "right" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            textTransform: "uppercase",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            background:
                              outcome === "success"
                                ? "rgba(16, 185, 129, 0.12)"
                                : outcome === "denied"
                                ? "rgba(220, 38, 38, 0.12)"
                                : "rgba(217, 119, 6, 0.12)",
                            color:
                              outcome === "success"
                                ? "#059669"
                                : outcome === "denied"
                                ? "#dc2626"
                                : "#d97706"
                          }}
                        >
                          {outcome === "success" ? (
                            <CheckCircle2 size={12} />
                          ) : (
                            <XCircle size={12} />
                          )}
                          <span>{outcome}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActivityPage;
