import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Card } from "../components/common/Card";
import { Badge } from "../components/common/Badge";
import { Button } from "../components/common/Button";
import { DataTable } from "../components/common/DataTable";
import { SearchFilterBar } from "../components/common/SearchFilterBar";
import { StatusBadge } from "../components/common/StatusBadge";
import { UserAvatar } from "../components/common/UserAvatar";
import { UserFormModal } from "../components/common/UserFormModal";
import { UserDetailsModal } from "../components/common/UserDetailsModal";
import { ImportPreviewModal } from "../components/common/ImportPreviewModal";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { EmptyState } from "../components/common/EmptyState";
import {
  getViewers,
  addViewer,
  updateViewer,
  toggleViewerStatus,
  importViewersBulk
} from "../services/masterDataService";
import { formatDate } from "../services/mockData";
import {
  Users,
  UserPlus,
  UploadCloud,
  Download,
  Eye,
  Edit2,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  FileText,
  Info
} from "lucide-react";

export function OwnerViewersPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const currentOwnerId = user?.id || 101;

  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(8);

  // Filters & Sorting
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [selectedViewerForEdit, setSelectedViewerForEdit] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedViewerForDetails, setSelectedViewerForDetails] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isConfirmToggleOpen, setIsConfirmToggleOpen] = useState(false);
  const [viewerForToggle, setViewerForToggle] = useState(null);
  const [toggleReason, setToggleReason] = useState("");

  const fetchViewers = useCallback(() => {
    setLoading(true);
    try {
      const result = getViewers({
        ownerId: currentOwnerId,
        search,
        status: statusFilter,
        accessState: accessFilter,
        sortBy,
        sortDir,
        page,
        limit: pageSize
      });
      if (result && typeof result.then === "function") {
        result
          .then((res) => {
            setViewers(res.viewers || []);
            setTotalCount(res.total || 0);
            setTotalPages(res.totalPages || 1);
            setLoading(false);
          })
          .catch((err) => {
            showToast(err.message || "Failed to load viewers data.", "error");
            setLoading(false);
          });
      } else if (result) {
        setViewers(result.viewers || []);
        setTotalCount(result.total || 0);
        setTotalPages(result.totalPages || 1);
        setLoading(false);
      }
    } catch (err) {
      showToast(err.message || "Failed to load viewers data.", "error");
      setLoading(false);
    }
  }, [currentOwnerId, search, statusFilter, accessFilter, sortBy, sortDir, page, pageSize, showToast]);

  useEffect(() => {
    fetchViewers();
  }, [fetchViewers]);

  // Sorting Handler
  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setAccessFilter("all");
    setPage(1);
  };

  // Add / Edit Handlers
  const handleOpenAdd = () => {
    setSelectedViewerForEdit(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (viewer) => {
    setSelectedViewerForEdit(viewer);
    setIsAddEditOpen(true);
  };

  const handleSaveViewer = async (formData) => {
    try {
      if (selectedViewerForEdit) {
        await updateViewer(selectedViewerForEdit.id, formData);
        showToast(`Viewer record for ${formData.name} updated successfully.`, "success");
      } else {
        await addViewer(formData, currentOwnerId);
        showToast(`Authorized Viewer ${formData.name} added to your roster.`, "success");
      }
      setIsAddEditOpen(false);
      fetchViewers();
    } catch (err) {
      showToast(err.message || "Failed to save viewer.", "error");
    }
  };

  // Status Toggle
  const handleOpenToggle = (viewer) => {
    setViewerForToggle(viewer);
    setToggleReason("");
    setIsConfirmToggleOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!viewerForToggle) return;
    const nextStatus = viewerForToggle.status === "active" ? "inactive" : "active";
    try {
      await toggleViewerStatus(viewerForToggle.id, nextStatus, toggleReason);
      showToast(`Viewer ${viewerForToggle.name} status updated to ${nextStatus}.`, "success");
      setIsConfirmToggleOpen(false);
      setViewerForToggle(null);
      fetchViewers();
    } catch (err) {
      showToast(err.message || "Failed to update viewer status.", "error");
    }
  };

  // Details
  const handleOpenDetails = (viewer) => {
    setSelectedViewerForDetails(viewer);
    setIsDetailsOpen(true);
  };

  // Bulk Import
  const handleConfirmImport = async (validRows) => {
    try {
      const res = await importViewersBulk(validRows, currentOwnerId);
      showToast(`Successfully imported ${res.addedCount || 0} viewer records to your roster!`, "success");
      fetchViewers();
      return res;
    } catch (err) {
      showToast(err.message || "Failed to import viewers.", "error");
      throw err;
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const res = await getViewers({ ownerId: currentOwnerId, limit: 1000 });
      const allData = res?.viewers || (Array.isArray(viewers) ? viewers : []);
      if (allData.length === 0) {
        showToast("No viewer records to export.", "info");
        return;
      }
      const headers = ["ID", "Name", "Email", "Mobile", "Department", "Status", "Access State", "Assigned Docs", "Created At"];
      const rows = allData.map((v) => [
        v.id,
        `"${(v.name || "").replace(/"/g, '""')}"`,
        `"${(v.email || "").replace(/"/g, '""')}"`,
        `"${(v.mobile || "").replace(/"/g, '""')}"`,
        `"${(v.department || "").replace(/"/g, '""')}"`,
        v.status,
        v.access_state,
        (v.assigned_documents || []).length,
        v.created_at
      ]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.href = encodedUri;
      link.download = `trustvault_viewers_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Viewer roster exported as CSV.", "success");
    } catch (err) {
      showToast(err.message || "Failed to export viewers.", "error");
    }
  };

  // Metric aggregates
  const allViewers = Array.isArray(viewers) ? viewers : [];
  const activeCount = useMemo(() => allViewers.filter((v) => v.status === "active").length, [allViewers]);
  const grantedCount = useMemo(() => allViewers.filter((v) => v.access_state === "granted").length, [allViewers]);
  const restrictedCount = useMemo(() => allViewers.filter((v) => v.access_state === "restricted" || v.access_state === "revoked" || v.status === "suspended").length, [allViewers]);

  const existingEmails = useMemo(() => new Set(allViewers.map((v) => (v.email || "").toLowerCase())), [allViewers]);

  // Columns definition
  const columns = [
    {
      key: "name",
      label: "Viewer Name",
      sortable: true,
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <UserAvatar name={row.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
              {row.name}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {row.department || "Field Operations"}
            </span>
          </div>
        </div>
      )
    },
    {
      key: "email",
      label: "Corporate Email",
      sortable: true,
      render: (row) => (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--text-secondary)" }}>
          {row.email}
        </span>
      )
    },
    {
      key: "mobile",
      label: "Mobile Contact",
      render: (row) => (
        <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
          {row.mobile || "—"}
        </span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: "access_state",
      label: "Access State",
      sortable: true,
      render: (row) => <StatusBadge status={row.access_state} type="access" />
    },
    {
      key: "assigned_documents",
      label: "Assigned Docs",
      align: "center",
      render: (row) => (
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            padding: "2px 8px",
            background: "rgba(14, 165, 233, 0.08)",
            borderRadius: "8px",
            color: "#0284c7"
          }}
        >
          {(row.assigned_documents || []).length}
        </span>
      )
    },
    {
      key: "created_at",
      label: "Rostered On",
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {formatDate(row.created_at)}
        </span>
      )
    },
    {
      key: "actions",
      label: "Actions",
      align: "right",
      render: (row) => (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <button
            type="button"
            onClick={() => handleOpenDetails(row)}
            aria-label={`View details and assigned documents for ${row.name}`}
            title="View Details & Assigned Documents"
            style={actionBtnStyle}
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(row)}
            aria-label={`Edit ${row.name}`}
            title="Edit Viewer Profile"
            style={actionBtnStyle}
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleOpenToggle(row)}
            aria-label={row.status === "active" ? `Deactivate ${row.name}` : `Activate ${row.name}`}
            title={row.status === "active" ? "Deactivate Viewer" : "Activate Viewer"}
            style={{
              ...actionBtnStyle,
              color: row.status === "active" ? "#dc2626" : "#059669",
              background: row.status === "active" ? "rgba(239, 68, 68, 0.08)" : "rgba(16, 185, 129, 0.08)"
            }}
          >
            {row.status === "active" ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header Bar */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "22px",
                fontWeight: 800,
                color: "var(--text-primary)",
                margin: 0
              }}
            >
              Viewer Master Data
            </h1>
            <Badge type="owner" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Manage authorized viewers, confidentiality rosters, access states, and bulk spreadsheet import for your documents.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            icon={<Download size={14} />}
          >
            Export CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportOpen(true)}
            icon={<UploadCloud size={14} />}
          >
            Bulk Import
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleOpenAdd}
            icon={<UserPlus size={14} />}
          >
            Add Viewer
          </Button>
        </div>
      </div>

      {/* Scope Disclaimer Banner (communicates Owners manage only their own Viewers) */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "14px 18px",
          borderRadius: "16px",
          background: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(99, 102, 241, 0.18)"
        }}
      >
        <Info size={18} color="#6366f1" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div>
          <strong style={{ fontSize: "13.5px", color: "var(--text-primary)" }}>
            Document Owner Scope Policy
          </strong>
          <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "2px 0 0 0", lineHeight: 1.45 }}>
            As a Document Owner, you can view, roster, and manage access permissions only for viewers assigned to your documents. Cross-tenant and system-wide user governance remains restricted to Enterprise Administrators.
          </p>
        </div>
      </div>

      {/* Metrics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "16px"
        }}
      >
        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Total Roster
            </span>
            <Users size={16} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
            {totalCount || allViewers.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Viewers in your roster
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>
              Active Viewers
            </span>
            <CheckCircle2 size={16} color="#059669" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#059669", marginTop: "8px" }}>
            {activeCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Active corporate accounts
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#0284c7", textTransform: "uppercase" }}>
              Access Granted
            </span>
            <Eye size={16} color="#0284c7" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#0284c7", marginTop: "8px" }}>
            {grantedCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Permitted in-app preview
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Restricted / Suspended
            </span>
            <AlertTriangle size={16} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
            {restrictedCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Access locked or revoked
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <SearchFilterBar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        searchPlaceholder="Search viewers by name, email, mobile, or department..."
        filters={[
          {
            label: "Status",
            value: statusFilter,
            onChange: (v) => {
              setStatusFilter(v);
              setPage(1);
            },
            options: [
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "suspended", label: "Suspended" }
            ]
          },
          {
            label: "Access",
            value: accessFilter,
            onChange: (v) => {
              setAccessFilter(v);
              setPage(1);
            },
            options: [
              { value: "all", label: "All Access States" },
              { value: "granted", label: "Access Granted" },
              { value: "restricted", label: "Restricted" },
              { value: "revoked", label: "Access Revoked" }
            ]
          }
        ]}
        onReset={handleResetFilters}
        totalCount={allViewers.length}
        filteredCount={totalCount}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={viewers}
        loading={loading}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        totalCount={totalCount}
        onPageChange={(p) => setPage(p)}
        emptyState={
          <EmptyState
            title="No Viewer Records Found"
            description={
              search || statusFilter !== "all" || accessFilter !== "all"
                ? "No viewers match your current filter criteria. Try clearing search filters."
                : "No viewers are currently rostered in your master database. Click 'Add Viewer' or 'Bulk Import' to onboard authorized viewers."
            }
            action={
              search || statusFilter !== "all" || accessFilter !== "all" ? (
                <Button variant="outline" size="sm" onClick={handleResetFilters} icon={<RotateCcw size={13} />}>
                  Reset Filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleOpenAdd} icon={<UserPlus size={14} />}>
                  Add First Viewer
                </Button>
              )
            }
          />
        }
      />

      {/* Add / Edit Viewer Modal */}
      <UserFormModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        onSubmit={handleSaveViewer}
        initialData={selectedViewerForEdit}
        role="viewer"
      />

      {/* View Viewer Details Modal */}
      <UserDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        userItem={selectedViewerForDetails}
        role="viewer"
        onEdit={(v) => handleOpenEdit(v)}
        onToggleStatus={(v) => handleOpenToggle(v)}
      />

      {/* Bulk Import Modal */}
      <ImportPreviewModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onConfirmImport={handleConfirmImport}
        type="viewers"
        existingEmails={existingEmails}
      />

      {/* Confirm Status Toggle Dialog */}
      <ConfirmDialog
        isOpen={isConfirmToggleOpen}
        onClose={() => setIsConfirmToggleOpen(false)}
        onConfirm={handleConfirmToggle}
        title={viewerForToggle?.status === "active" ? "Deactivate Viewer Account" : "Activate Viewer Account"}
        message={
          viewerForToggle?.status === "active"
            ? `Are you sure you want to deactivate ${viewerForToggle?.name}'s viewer account? They will lose access to preview assigned documents.`
            : `Are you sure you want to activate ${viewerForToggle?.name}'s viewer account? They will regain in-app document preview access.`
        }
        confirmText={viewerForToggle?.status === "active" ? "Deactivate Account" : "Activate Account"}
        variant={viewerForToggle?.status === "active" ? "danger" : "primary"}
      />
    </div>
  );
}

const metricCardStyle = {
  padding: "18px 20px",
  borderRadius: "18px",
  boxShadow: "0 4px 18px rgba(15, 23, 42, 0.04)"
};

const actionBtnStyle = {
  background: "rgba(15, 23, 42, 0.05)",
  border: "none",
  borderRadius: "8px",
  width: "28px",
  height: "28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "var(--text-secondary)",
  transition: "all 0.15s ease"
};

export default OwnerViewersPage;
