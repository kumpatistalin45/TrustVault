import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { useToast } from "../context/ToastContext";
import {
  getOwners,
  addOwner,
  updateOwner,
  toggleOwnerStatus,
  importOwnersBulk
} from "../services/masterDataService";
import { formatDate } from "../services/mockData";
import {
  UserCheck,
  Users,
  UserPlus,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Eye,
  Edit2,
  Lock,
  Unlock,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  ShieldCheck
} from "lucide-react";

export function AdminOwnersPage() {
  const { showToast } = useToast();

  const [owners, setOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(8);

  // Filters & Sorting
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState("desc");

  // Modals
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [selectedOwnerForEdit, setSelectedOwnerForEdit] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedOwnerForDetails, setSelectedOwnerForDetails] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isConfirmToggleOpen, setIsConfirmToggleOpen] = useState(false);
  const [ownerForToggle, setOwnerForToggle] = useState(null);
  const [toggleReason, setToggleReason] = useState("");

  const fetchOwners = useCallback(() => {
    setLoading(true);
    try {
      const result = getOwners({
        search,
        status: statusFilter,
        approvalState: approvalFilter,
        sortBy,
        sortDir,
        page,
        limit: pageSize
      });
      if (result && typeof result.then === "function") {
        result
          .then((res) => {
            setOwners(res.owners || []);
            setTotalCount(res.total || 0);
            setTotalPages(res.totalPages || 1);
            setLoading(false);
          })
          .catch((err) => {
            showToast(err.message || "Failed to load owners data.", "error");
            setLoading(false);
          });
      } else if (result) {
        setOwners(result.owners || []);
        setTotalCount(result.total || 0);
        setTotalPages(result.totalPages || 1);
        setLoading(false);
      }
    } catch (err) {
      showToast(err.message || "Failed to load owners data.", "error");
      setLoading(false);
    }
  }, [search, statusFilter, approvalFilter, sortBy, sortDir, page, pageSize, showToast]);

  useEffect(() => {
    fetchOwners();
  }, [fetchOwners]);

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
    setApprovalFilter("all");
    setPage(1);
  };

  // Add / Edit Handlers
  const handleOpenAdd = () => {
    setSelectedOwnerForEdit(null);
    setIsAddEditOpen(true);
  };

  const handleOpenEdit = (owner) => {
    setSelectedOwnerForEdit(owner);
    setIsAddEditOpen(true);
  };

  const handleSaveOwner = async (formData) => {
    try {
      if (selectedOwnerForEdit) {
        await updateOwner(selectedOwnerForEdit.id, formData);
        showToast(`Owner record for ${formData.name} updated successfully.`, "success");
      } else {
        await addOwner(formData);
        showToast(`Document Owner ${formData.name} added to master data.`, "success");
      }
      setIsAddEditOpen(false);
      fetchOwners();
    } catch (err) {
      showToast(err.message || "Failed to save owner.", "error");
    }
  };

  // Status Toggle
  const handleOpenToggle = (owner) => {
    setOwnerForToggle(owner);
    setToggleReason("");
    setIsConfirmToggleOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!ownerForToggle) return;
    const nextStatus = ownerForToggle.status === "active" ? "inactive" : "active";
    try {
      await toggleOwnerStatus(ownerForToggle.id, nextStatus, toggleReason);
      showToast(`Owner ${ownerForToggle.name} status updated to ${nextStatus}.`, "success");
      setIsConfirmToggleOpen(false);
      setOwnerForToggle(null);
      fetchOwners();
    } catch (err) {
      showToast(err.message || "Failed to update owner status.", "error");
    }
  };

  // Details
  const handleOpenDetails = (owner) => {
    setSelectedOwnerForDetails(owner);
    setIsDetailsOpen(true);
  };

  // Bulk Import
  const handleConfirmImport = async (validRows) => {
    try {
      const res = await importOwnersBulk(validRows);
      showToast(`Successfully imported ${res.addedCount || 0} owner records!`, "success");
      fetchOwners();
      return res;
    } catch (err) {
      showToast(err.message || "Failed to import owners.", "error");
      throw err;
    }
  };

  // Export CSV
  const handleExportCsv = async () => {
    try {
      const res = await getOwners({ limit: 1000 });
      const allData = res?.owners || (Array.isArray(owners) ? owners : []);
      if (allData.length === 0) {
        showToast("No owner records to export.", "info");
        return;
      }
      const headers = ["ID", "Name", "Email", "Mobile", "Department", "Status", "Approval State", "Documents", "Created At"];
      const rows = allData.map((o) => [
        o.id,
        `"${(o.name || "").replace(/"/g, '""')}"`,
        `"${(o.email || "").replace(/"/g, '""')}"`,
        `"${(o.mobile || "").replace(/"/g, '""')}"`,
        `"${(o.department || "").replace(/"/g, '""')}"`,
        o.status,
        o.approval_state,
        o.documents_count || 0,
        o.created_at
      ]);
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.href = encodedUri;
      link.download = `trustvault_owners_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast("Owner master records exported as CSV.", "success");
    } catch (err) {
      showToast(err.message || "Failed to export owners.", "error");
    }
  };

  // Metric aggregates
  const allOwners = Array.isArray(owners) ? owners : [];
  const activeCount = useMemo(() => allOwners.filter((o) => o.status === "active").length, [allOwners]);
  const pendingCount = useMemo(() => allOwners.filter((o) => o.approval_state === "pending" || o.status === "pending").length, [allOwners]);
  const inactiveCount = useMemo(() => allOwners.filter((o) => o.status === "inactive" || o.approval_state === "rejected").length, [allOwners]);

  const existingEmails = useMemo(() => new Set(allOwners.map((o) => (o.email || "").toLowerCase())), [allOwners]);

  // Columns definition
  const columns = [
    {
      key: "name",
      label: "Document Owner",
      sortable: true,
      render: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <UserAvatar name={row.name} size="sm" />
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
              {row.name}
            </span>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
              {row.department || "Operations"}
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
      key: "approval_state",
      label: "Approval State",
      sortable: true,
      render: (row) => <StatusBadge status={row.approval_state} type="approval" />
    },
    {
      key: "documents_count",
      label: "Managed Docs",
      sortable: true,
      align: "center",
      render: (row) => (
        <span
          style={{
            fontSize: "12px",
            fontWeight: 700,
            padding: "2px 8px",
            background: "rgba(15, 23, 42, 0.05)",
            borderRadius: "8px",
            color: "var(--text-primary)"
          }}
        >
          {row.documents_count || 0}
        </span>
      )
    },
    {
      key: "created_at",
      label: "Onboarded",
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
            aria-label={`View details for ${row.name}`}
            title="View Owner Details"
            style={actionBtnStyle}
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(row)}
            aria-label={`Edit ${row.name}`}
            title="Edit Owner Profile"
            style={actionBtnStyle}
          >
            <Edit2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => handleOpenToggle(row)}
            aria-label={row.status === "active" ? `Deactivate ${row.name}` : `Activate ${row.name}`}
            title={row.status === "active" ? "Deactivate Account" : "Activate Account"}
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
              Owner Master Data Management
            </h1>
            <Badge type="admin" />
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "13.5px", margin: 0 }}>
            Authorize and manage Document Owners, governance status, approval lifecycles, and bulk on-boarding.
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
            Add Owner
          </Button>
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
              Total Owners
            </span>
            <Users size={16} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
            {totalCount || allOwners.length}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Registered enterprise owners
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#059669", textTransform: "uppercase" }}>
              Active & Approved
            </span>
            <CheckCircle2 size={16} color="#059669" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#059669", marginTop: "8px" }}>
            {activeCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Authorized to upload & share
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#d97706", textTransform: "uppercase" }}>
              Pending Approval
            </span>
            <Clock size={16} color="#d97706" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "#d97706", marginTop: "8px" }}>
            {pendingCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Awaiting administrator review
          </div>
        </div>

        <div className="card-white" style={metricCardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Suspended / Inactive
            </span>
            <AlertTriangle size={16} color="var(--text-muted)" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 800, color: "var(--text-primary)", marginTop: "8px" }}>
            {inactiveCount}
          </div>
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px" }}>
            Revoked or rejected access
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
        searchPlaceholder="Search owners by name, email, mobile, or department..."
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
              { value: "pending", label: "Pending" },
              { value: "inactive", label: "Inactive" }
            ]
          },
          {
            label: "Approval",
            value: approvalFilter,
            onChange: (v) => {
              setApprovalFilter(v);
              setPage(1);
            },
            options: [
              { value: "all", label: "All Approvals" },
              { value: "approved", label: "Approved" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" }
            ]
          }
        ]}
        onReset={handleResetFilters}
        totalCount={allOwners.length}
        filteredCount={totalCount}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={owners}
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
            title="No Owner Records Found"
            description={
              search || statusFilter !== "all" || approvalFilter !== "all"
                ? "No document owners match your current filter criteria. Try clearing search filters."
                : "No document owners are currently registered in the master database. Click 'Add Owner' or 'Bulk Import' to onboard owners."
            }
            action={
              search || statusFilter !== "all" || approvalFilter !== "all" ? (
                <Button variant="outline" size="sm" onClick={handleResetFilters} icon={<RotateCcw size={13} />}>
                  Reset Filters
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleOpenAdd} icon={<UserPlus size={14} />}>
                  Add First Owner
                </Button>
              )
            }
          />
        }
      />

      {/* Add / Edit Owner Modal */}
      <UserFormModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        onSubmit={handleSaveOwner}
        initialData={selectedOwnerForEdit}
        role="owner"
      />

      {/* View Owner Details Modal */}
      <UserDetailsModal
        isOpen={isDetailsOpen}
        onClose={() => setIsDetailsOpen(false)}
        userItem={selectedOwnerForDetails}
        role="owner"
        onEdit={(o) => handleOpenEdit(o)}
        onToggleStatus={(o) => handleOpenToggle(o)}
      />

      {/* Bulk Import Modal */}
      <ImportPreviewModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onConfirmImport={handleConfirmImport}
        type="owners"
        existingEmails={existingEmails}
      />

      {/* Confirm Status Toggle Dialog */}
      <ConfirmDialog
        isOpen={isConfirmToggleOpen}
        onClose={() => setIsConfirmToggleOpen(false)}
        onConfirm={handleConfirmToggle}
        title={ownerForToggle?.status === "active" ? "Deactivate Owner Account" : "Activate Owner Account"}
        message={
          ownerForToggle?.status === "active"
            ? `Are you sure you want to deactivate ${ownerForToggle?.name}'s account? They will lose access to upload and manage documents.`
            : `Are you sure you want to activate ${ownerForToggle?.name}'s account? They will be granted full document management access.`
        }
        confirmText={ownerForToggle?.status === "active" ? "Deactivate Account" : "Activate Account"}
        variant={ownerForToggle?.status === "active" ? "danger" : "primary"}
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

export default AdminOwnersPage;
