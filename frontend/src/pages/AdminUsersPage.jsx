import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiGetAdminUsers, apiUpdateUserStatus } from "../services/api";
import { formatDate } from "../services/mockData";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { Input } from "../components/common/Input";
import { Select } from "../components/common/Select";
import { Modal } from "../components/common/Modal";
import { TableSkeleton } from "../components/common/Skeleton";
import { EmptyState } from "../components/common/EmptyState";
import { UserAvatar } from "../components/common/UserAvatar";
import {
  Users,
  Search,
  Filter,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Lock,
  UserCheck,
  UserX,
  Info,
  Download
} from "lucide-react";

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Status Change Confirmation Modal
  const [selectedUser, setSelectedUser] = useState(null);
  const [targetStatus, setTargetStatus] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetAdminUsers({
        search,
        role: roleFilter,
        status: statusFilter
      });
      setUsers(res.users || []);
    } catch (err) {
      setError(err.message || "Failed to load user records.");
      showToast(err.message || "Could not retrieve user list", "error");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, showToast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenStatusModal = (userItem, newStatus) => {
    setSelectedUser(userItem);
    setTargetStatus(newStatus);
    setChangeReason("");
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedUser || !targetStatus) return;
    setSubmitting(true);
    try {
      await apiUpdateUserStatus(selectedUser.id, {
        status: targetStatus,
        reason: changeReason.trim() || `Administrative ${targetStatus} action`
      });
      showToast(`User ${selectedUser.email} status updated to ${targetStatus}.`, "success");
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      showToast(err.message || "Failed to update account status.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  const handleExportCsv = () => {
    if (!users || users.length === 0) {
      showToast("No user records available to export.", "info");
      return;
    }
    const headers = ["ID", "Name", "Email", "Role", "Status", "Registration Date", "Last Session"];
    const rows = users.map((u) => [
      u.id,
      `"${(u.name || "").replace(/"/g, '""')}"`,
      `"${(u.email || "").replace(/"/g, '""')}"`,
      u.role || "viewer",
      u.status || "active",
      u.created_at ? new Date(u.created_at).toISOString() : "",
      u.last_login ? new Date(u.last_login).toISOString() : ""
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `trustvault_users_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("User counts and account summary exported as CSV.", "success");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              User & Role Management
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Inspect registered accounts, role grants, activation states, and security posture across the enterprise.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={loading || users.length === 0} icon={<Download size={14} />}>
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading} icon={<RotateCcw size={14} />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Security Guidance Alert */}
      <div
        style={{
          padding: "14px 18px",
          borderRadius: "14px",
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          fontSize: "12.5px",
          color: "var(--text-primary)",
          lineHeight: 1.5
        }}
      >
        <ShieldCheck size={18} color="#6366f1" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong style={{ display: "block", color: "#4f46e5", marginBottom: "2px" }}>
            Trusted Role Provisioning Standard
          </strong>
          Each account identity corresponds to exactly one role (Admin, Owner, or Viewer). Admin accounts cannot be self-provisioned
          or upgraded through public registration or unverified claims. Sensitive administrative status modifications require explicit justification.
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ padding: "18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "14px", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Search Users
            </label>
            <Input
              placeholder="Search by legal name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search size={15} color="var(--text-muted)" />}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Role Assignment
            </label>
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[
                { value: "all", label: "All Roles" },
                { value: "admin", label: "System Admin" },
                { value: "owner", label: "Document Owner" },
                { value: "viewer", label: "Document Viewer" }
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Account Status
            </label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "suspended", label: "Suspended" }
              ]}
            />
          </div>

          <div>
            <Button variant="ghost" size="sm" onClick={resetFilters} style={{ width: "100%", height: "40px" }}>
              Clear Filters
            </Button>
          </div>
        </div>
      </Card>

      {/* Users Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "20px" }}>
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: "40px 20px" }}>
            <EmptyState
              title="No user accounts match criteria"
              description="Adjust your search terms or filter selections to view registered accounts."
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "rgba(248, 250, 252, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.9)" }}>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Account Identity
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Assigned Role
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Status
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Registration Date
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Last Session
                  </th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>
                    Administrative Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isCurrent = currentUser?.id === u.id || currentUser?.email === u.email;
                  const status = (u.status || "active").toLowerCase();

                  return (
                    <tr
                      key={u.id}
                      style={{
                        borderBottom: "1px solid rgba(226, 232, 240, 0.6)",
                        transition: "background 0.15s ease"
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(241, 245, 249, 0.4)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {/* Name & Avatar */}
                      <td style={{ padding: "14px 18px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <UserAvatar user={u} size={34} />
                          <div>
                            <span style={{ display: "block", fontWeight: 700, color: "var(--text-primary)" }}>
                              {u.name} {isCurrent && <span style={{ fontSize: "11px", color: "var(--brand-primary)", fontWeight: 600 }}>(You)</span>}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                              {u.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td style={{ padding: "14px 18px" }}>
                        <Badge type={u.role || "viewer"} />
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 8px",
                            borderRadius: "8px",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            background:
                              status === "active"
                                ? "rgba(16, 185, 129, 0.1)"
                                : status === "suspended"
                                ? "rgba(239, 68, 68, 0.1)"
                                : "rgba(100, 116, 139, 0.1)",
                            color:
                              status === "active"
                                ? "#059669"
                                : status === "suspended"
                                ? "#dc2626"
                                : "#475569"
                          }}
                        >
                          <span
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background:
                                status === "active"
                                  ? "#10b981"
                                  : status === "suspended"
                                  ? "#ef4444"
                                  : "#64748b"
                            }}
                          />
                          {status}
                        </span>
                      </td>

                      {/* Registration Date */}
                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {formatDate(u.created_at)}
                      </td>

                      {/* Last Session */}
                      <td style={{ padding: "14px 18px", color: "var(--text-muted)" }}>
                        {u.last_login ? formatDate(u.last_login) : "—"}
                      </td>

                      {/* Action */}
                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        {isCurrent ? (
                          <span style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
                            Current session
                          </span>
                        ) : status === "active" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenStatusModal(u, "inactive")}
                            icon={<UserX size={13} />}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleOpenStatusModal(u, "active")}
                            icon={<UserCheck size={13} />}
                          >
                            Activate
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirmation & Reason Capture Modal */}
      {selectedUser && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          title={`Confirm Account Status Change: ${targetStatus.toUpperCase()}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                padding: "14px",
                borderRadius: "12px",
                background: targetStatus === "inactive" || targetStatus === "suspended" ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)",
                border: `1px solid ${targetStatus === "inactive" || targetStatus === "suspended" ? "rgba(239, 68, 68, 0.2)" : "rgba(16, 185, 129, 0.2)"}`,
                fontSize: "13px",
                color: "var(--text-primary)",
                lineHeight: 1.5
              }}
            >
              <strong>Target Account:</strong> {selectedUser.name} ({selectedUser.email})<br />
              <strong>Role:</strong> {selectedUser.role?.toUpperCase()}<br />
              <strong>Intended Action:</strong> Change account state to <strong>{targetStatus}</strong>.
            </div>

            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "6px" }}>
                Administrative Reason / Justification
              </label>
              <textarea
                value={changeReason}
                onChange={(e) => setChangeReason(e.target.value)}
                placeholder="Specify the operational or security justification for this account state modification..."
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
              <Button variant="ghost" onClick={() => setSelectedUser(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant={targetStatus === "inactive" || targetStatus === "suspended" ? "danger" : "primary"}
                onClick={handleConfirmStatusChange}
                disabled={submitting}
              >
                {submitting ? "Updating..." : `Confirm ${targetStatus.toUpperCase()}`}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminUsersPage;
