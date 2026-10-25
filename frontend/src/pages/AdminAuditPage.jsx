import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiGetAuditLogs } from "../services/api";
import { MOCK_AUDIT_LOGS } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import {
  ShieldAlert,
  Search,
  RotateCcw,
  Code,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck
} from "lucide-react";

export function AdminAuditPage() {
  const { isAdmin, isMockMode } = useAuth();
  const { showToast } = useToast();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [filterAction, setFilterAction] = useState("");
  const [filterOutcome, setFilterOutcome] = useState("");
  const [filterActorId, setFilterActorId] = useState("");
  const [filterDocId, setFilterDocId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Pagination
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Details Modal
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMockMode) {
        let filtered = [...MOCK_AUDIT_LOGS];
        if (filterAction) {
          filtered = filtered.filter((l) => l.action === filterAction);
        }
        if (filterOutcome) {
          filtered = filtered.filter((l) => l.outcome === filterOutcome);
        }
        if (filterActorId) {
          filtered = filtered.filter((l) => String(l.actor_id) === String(filterActorId));
        }
        if (filterDocId) {
          filtered = filtered.filter((l) => String(l.document_id) === String(filterDocId));
        }
        setLogs(filtered);
      } else {
        const res = await apiGetAuditLogs({
          action: filterAction || undefined,
          outcome: filterOutcome || undefined,
          actorId: filterActorId || undefined,
          documentId: filterDocId || undefined,
          from: filterFrom || undefined,
          to: filterTo || undefined,
          limit,
          offset
        });
        setLogs(res.auditLogs || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load audit logs");
      showToast(err.message || "Could not retrieve audit logs", "error");
    } finally {
      setLoading(false);
    }
  }, [filterAction, filterOutcome, filterActorId, filterDocId, filterFrom, filterTo, limit, offset, isMockMode, showToast]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleReset = () => {
    setFilterAction("");
    setFilterOutcome("");
    setFilterActorId("");
    setFilterDocId("");
    setFilterFrom("");
    setFilterTo("");
    setOffset(0);
  };

  function formatDate(isoStr) {
    if (!isoStr) return "—";
    try {
      return new Date(isoStr).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      });
    } catch (_e) {
      return isoStr;
    }
  }

  const hasFilters = filterAction || filterOutcome || filterActorId || filterDocId || filterFrom || filterTo;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#ffffff" }}>
            Admin Audit & Security Log Portal
          </h2>
          <Badge type="admin" />
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
          Immutable activity records for all uploads, downloads, modifications, authorization decisions, and access attempts.
        </p>
      </div>

      {/* Filter Card */}
      <Card style={{ padding: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: "12px" }}>
          <Select
            label="Filter by Action"
            value={filterAction}
            onChange={(e) => {
              setFilterAction(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
          >
            <option value="">All Actions</option>
            <option value="auth_login">auth_login</option>
            <option value="auth_register">auth_register</option>
            <option value="auth_logout">auth_logout</option>
            <option value="document_upload">document_upload</option>
            <option value="document_read">document_read</option>
            <option value="document_update">document_update</option>
            <option value="document_download">document_download</option>
            <option value="document_delete">document_delete</option>
            <option value="permission_grant">permission_grant</option>
            <option value="permission_revoke">permission_revoke</option>
            <option value="admin_audit_logs_read">admin_audit_logs_read</option>
          </Select>

          <Select
            label="Filter by Outcome"
            value={filterOutcome}
            onChange={(e) => {
              setFilterOutcome(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
          >
            <option value="">All Outcomes</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="failure">Failure</option>
          </Select>

          <Input
            label="Actor User ID"
            type="number"
            placeholder="e.g. 1"
            value={filterActorId}
            onChange={(e) => {
              setFilterActorId(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="Document ID"
            type="number"
            placeholder="e.g. 102"
            value={filterDocId}
            onChange={(e) => {
              setFilterDocId(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
          />

          <Input
            label="From Date"
            type="date"
            value={filterFrom}
            onChange={(e) => {
              setFilterFrom(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
            style={{ colorScheme: "dark" }}
          />

          <Input
            label="To Date"
            type="date"
            value={filterTo}
            onChange={(e) => {
              setFilterTo(e.target.value);
              setOffset(0);
            }}
            containerStyle={{ marginBottom: 0 }}
            style={{ colorScheme: "dark" }}
          />
        </div>

        {hasFilters && (
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end" }}>
            <Button variant="secondary" size="sm" onClick={handleReset} icon={<RotateCcw size={14} />}>
              Reset All Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Main Audit Log Table Card */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={36} color="var(--text-muted)" />}
            title="No audit events found"
            description={hasFilters ? "No records match the selected filters." : "No audit events logged yet."}
            actionLabel={hasFilters ? "Reset Filters" : null}
            onAction={handleReset}
          />
        ) : (
          <div className="table-container" style={{ border: "none", borderRadius: 0 }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Outcome</th>
                  <th>Actor</th>
                  <th>Document ID</th>
                  <th style={{ textAlign: "right", paddingRight: "20px" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
                        {formatDate(log.created_at)}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 600,
                          fontFamily: "var(--font-mono)",
                          color: "#ffffff"
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <Badge type={log.outcome} />
                    </td>
                    <td>
                      <div style={{ fontSize: "13px" }}>
                        <span style={{ color: "#ffffff", fontWeight: 500 }}>
                          {log.actor_name || (log.actor_id ? `User #${log.actor_id}` : "Anonymous")}
                        </span>
                        {log.actor_email && (
                          <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)" }}>
                            {log.actor_email}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: "13px", fontFamily: "var(--font-mono)", color: log.document_id ? "var(--accent-cyan)" : "var(--text-muted)" }}>
                        {log.document_id ? `#${log.document_id}` : "—"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right", paddingRight: "16px" }}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedLog(log)}
                        icon={<Code size={13} />}
                      >
                        View Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 20px",
            borderTop: "1px solid var(--border-subtle)",
            fontSize: "13px",
            color: "var(--text-muted)"
          }}
        >
          <span>
            Showing page {Math.floor(offset / limit) + 1} ({logs.length} events loaded)
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              icon={<ChevronLeft size={14} />}
            >
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={logs.length < limit}
              onClick={() => setOffset((prev) => prev + limit)}
              icon={<ChevronRight size={14} />}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Event Details Modal */}
      <Modal
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title={`Audit Event #${selectedLog?.id || ""}`}
        maxWidth="600px"
      >
        {selectedLog && (
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginBottom: "20px",
                fontSize: "13px"
              }}
            >
              <div>
                <span className="form-label">Action</span>
                <span style={{ fontFamily: "var(--font-mono)", color: "#ffffff", fontWeight: 600 }}>
                  {selectedLog.action}
                </span>
              </div>
              <div>
                <span className="form-label">Outcome</span>
                <Badge type={selectedLog.outcome} />
              </div>
              <div>
                <span className="form-label">Actor</span>
                <span style={{ color: "#ffffff" }}>
                  {selectedLog.actor_name || `User ID #${selectedLog.actor_id || "None"}`}
                </span>
              </div>
              <div>
                <span className="form-label">Timestamp</span>
                <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>
                  {formatDate(selectedLog.created_at)}
                </span>
              </div>
            </div>

            <span className="form-label">Metadata & Event Payload (JSON)</span>
            <pre
              style={{
                background: "#0c0e14",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "16px",
                fontSize: "12px",
                color: "#7dd3fc",
                fontFamily: "var(--font-mono)",
                overflowX: "auto",
                maxHeight: "280px"
              }}
            >
              {JSON.stringify(selectedLog.details, null, 2)}
            </pre>
          </div>
        )}
      </Modal>
    </div>
  );
}
