import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiGetAdminComplaints, apiUpdateComplaintStatus } from "../services/api";
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
  Inbox,
  Search,
  RotateCcw,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Paperclip,
  ShieldCheck,
  User,
  Mail,
  ChevronRight,
  Filter
} from "lucide-react";

export function AdminComplaintsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  // Detail Modal
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [newStatus, setNewStatus] = useState("");
  const [newPriority, setNewPriority] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetAdminComplaints({
        search,
        category: categoryFilter,
        status: statusFilter,
        priority: priorityFilter
      });
      setComplaints(res.complaints || []);
    } catch (err) {
      setError(err.message || "Failed to load support complaints.");
      showToast(err.message || "Could not retrieve complaints inbox", "error");
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter, priorityFilter, showToast]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const handleOpenDetailModal = (comp) => {
    setSelectedComplaint(comp);
    setNewStatus(comp.status || "Pending");
    setNewPriority(comp.priority || "Medium");
    setResponseNote("");
    setSendEmail(false);
  };

  const handleUpdateComplaint = async (e) => {
    e.preventDefault();
    if (!selectedComplaint) return;

    setSubmitting(true);
    try {
      await apiUpdateComplaintStatus(selectedComplaint.id, {
        status: newStatus,
        priority: newPriority,
        responseNote: responseNote.trim(),
        emailNotified: sendEmail
      });

      const emailNotice = sendEmail
        ? " (Email dispatch queued; verification recorded in audit log)"
        : " (Recorded in internal audit trail)";
      showToast(`Complaint ${selectedComplaint.referenceId} updated successfully${emailNotice}.`, "success");

      setSelectedComplaint(null);
      fetchComplaints();
    } catch (err) {
      showToast(err.message || "Failed to update complaint.", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setPriorityFilter("all");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>
              Admin Support Inbox & Complaints
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Triage submitted employee issues, update priority levels, append resolution notes, and track chronological status changes.
          </p>
        </div>

        <Button variant="outline" size="sm" onClick={fetchComplaints} disabled={loading} icon={<RotateCcw size={14} />}>
          Refresh
        </Button>
      </div>

      {/* Filter Toolbar */}
      <Card style={{ padding: "18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 170px), 1fr))", gap: "14px", alignItems: "flex-end" }}>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Search Complaints
            </label>
            <Input
              placeholder="Ref ID, subject, submitter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              prefix={<Search size={15} color="var(--text-muted)" />}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Category
            </label>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              options={[
                { value: "all", label: "All Categories" },
                { value: "Document Access", label: "Document Access" },
                { value: "Login/OTP", label: "Login / OTP" },
                { value: "Policy & Compliance", label: "Policy & Compliance" },
                { value: "General", label: "General" }
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Status
            </label>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "Pending", label: "Pending" },
                { value: "In Review", label: "In Review" },
                { value: "Resolved", label: "Resolved" },
                { value: "Closed", label: "Closed" }
              ]}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)", marginBottom: "6px" }}>
              Priority
            </label>
            <Select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              options={[
                { value: "all", label: "All Priorities" },
                { value: "High", label: "High" },
                { value: "Medium", label: "Medium" },
                { value: "Low", label: "Low" }
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

      {/* Complaints Inbox Table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "20px" }}>
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : complaints.length === 0 ? (
          <div style={{ padding: "40px 20px" }}>
            <EmptyState
              title="No complaints in this view"
              description="All submitted complaints match or filters exclude records."
            />
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "rgba(248, 250, 252, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.9)" }}>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Ref ID & Subject</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Submitter</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Category</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Priority</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Status</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase" }}>Submitted Date</th>
                  <th style={{ padding: "14px 18px", fontWeight: 700, color: "var(--text-secondary)", fontSize: "11.5px", textTransform: "uppercase", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {complaints.map((comp) => {
                  const isHigh = comp.priority === "High";
                  const isResolved = comp.status === "Resolved" || comp.status === "Closed";

                  return (
                    <tr
                      key={comp.id}
                      style={{ borderBottom: "1px solid rgba(226, 232, 240, 0.6)", transition: "background 0.15s ease" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(241, 245, 249, 0.4)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "#6366f1" }}>
                          {comp.referenceId}
                        </span>
                        <strong style={{ display: "block", color: "var(--text-primary)", marginTop: "2px" }}>
                          {comp.subject}
                        </strong>
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ display: "block", fontWeight: 600, color: "var(--text-primary)" }}>
                          {comp.submitterName || "Employee Submitter"}
                        </span>
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                          {comp.submitterEmail || "employee@trustvault.internal"}
                        </span>
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "6px", background: "rgba(15, 23, 42, 0.06)", fontSize: "11.5px", fontWeight: 600 }}>
                          {comp.category}
                        </span>
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: isHigh ? "rgba(239, 68, 68, 0.1)" : "rgba(245, 158, 11, 0.1)",
                            color: isHigh ? "#dc2626" : "#d97706"
                          }}
                        >
                          {comp.priority || "Normal"}
                        </span>
                      </td>

                      <td style={{ padding: "14px 18px" }}>
                        <span
                          style={{
                            padding: "3px 8px",
                            borderRadius: "6px",
                            fontSize: "11px",
                            fontWeight: 700,
                            background: isResolved ? "rgba(16, 185, 129, 0.1)" : "rgba(99, 102, 241, 0.1)",
                            color: isResolved ? "#059669" : "#6366f1"
                          }}
                        >
                          {comp.status}
                        </span>
                      </td>

                      <td style={{ padding: "14px 18px", color: "var(--text-secondary)" }}>
                        {formatDate(comp.createdAt)}
                      </td>

                      <td style={{ padding: "14px 18px", textAlign: "right" }}>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenDetailModal(comp)}
                          icon={<MessageSquare size={13} />}
                        >
                          Manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Complaint Detail & Resolution Modal */}
      {selectedComplaint && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedComplaint(null)}
          title={`Complaint ${selectedComplaint.referenceId}: ${selectedComplaint.subject}`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Meta header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                padding: "14px",
                borderRadius: "12px",
                background: "rgba(241, 245, 249, 0.7)",
                fontSize: "12.5px"
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                  Submitter
                </span>
                <strong>{selectedComplaint.submitterName}</strong> ({selectedComplaint.submitterEmail})
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                  Category & Date
                </span>
                <strong>{selectedComplaint.category}</strong> • {formatDate(selectedComplaint.createdAt)}
              </div>

              {selectedComplaint.relatedDocumentName && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 700, display: "block" }}>
                    Related Document
                  </span>
                  <span>{selectedComplaint.relatedDocumentName}</span>
                </div>
              )}

              {selectedComplaint.attachmentName && (
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Paperclip size={13} color="#6366f1" />
                  <span style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600 }}>
                    Attachment: {selectedComplaint.attachmentName}
                  </span>
                </div>
              )}
            </div>

            {/* Description */}
            <div>
              <span style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "6px" }}>
                Issue Description
              </span>
              <div
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  background: "rgba(255, 255, 255, 0.9)",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                  color: "var(--text-primary)"
                }}
              >
                {selectedComplaint.description}
              </div>
            </div>

            {/* Timeline History */}
            <div>
              <span style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "8px" }}>
                Chronological Status & Response History
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "180px", overflowY: "auto" }}>
                {(selectedComplaint.timeline || []).map((item, idx) => (
                  <div
                    key={item.id || idx}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: item.type === "admin" ? "rgba(99, 102, 241, 0.08)" : "rgba(241, 245, 249, 0.6)",
                      border: `1px solid ${item.type === "admin" ? "rgba(99, 102, 241, 0.2)" : "rgba(226, 232, 240, 0.8)"}`,
                      fontSize: "12px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <strong style={{ color: item.type === "admin" ? "#4f46e5" : "#334155" }}>
                        {item.author}
                      </strong>
                      <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                        {formatDate(item.timestamp)}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "var(--text-primary)", lineHeight: 1.4 }}>
                      {item.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Form */}
            <form onSubmit={handleUpdateComplaint} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 150px), 1fr))", gap: "12px" }}>
                <div>
                  <Select
                    label="Update Status"
                    id="complaint-update-status"
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    options={[
                      { value: "Pending", label: "Pending" },
                      { value: "In Review", label: "In Review" },
                      { value: "Resolved", label: "Resolved" },
                      { value: "Closed", label: "Closed" }
                    ]}
                  />
                </div>

                <div>
                  <Select
                    label="Update Priority"
                    id="complaint-update-priority"
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    options={[
                      { value: "Low", label: "Low Priority" },
                      { value: "Medium", label: "Medium Priority" },
                      { value: "High", label: "High Priority" }
                    ]}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: "6px" }}>
                  Add Support Response / Resolution Note
                </label>
                <textarea
                  value={responseNote}
                  onChange={(e) => setResponseNote(e.target.value)}
                  placeholder="Detail the investigation outcome, resolution steps, or response to the submitter..."
                  rows={3}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid rgba(203, 213, 225, 0.8)",
                    fontSize: "13px",
                    outline: "none",
                    fontFamily: "var(--font-sans)",
                    background: "rgba(255, 255, 255, 0.9)"
                  }}
                />
              </div>

              {/* Email Delivery Disclaimer Checkbox */}
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "rgba(241, 245, 249, 0.7)",
                  border: "1px solid rgba(226, 232, 240, 0.9)",
                  wordBreak: "break-word"
                }}
              >
                <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "12px", cursor: "pointer", color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                    style={{ marginTop: "2px", flexShrink: 0 }}
                  />
                  <span>
                    <strong>Dispatch update notification to submitter email.</strong>
                    <span style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      Note (Section 6 Policy): Delivery is subject to SMTP confirmation. If email delivery is unconfirmed,
                      the action is recorded in the internal audit trail only without claiming delivery.
                    </span>
                  </span>
                </label>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
                <Button variant="ghost" type="button" onClick={() => setSelectedComplaint(null)} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? "Saving Updates..." : "Save Complaint Updates"}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default AdminComplaintsPage;
