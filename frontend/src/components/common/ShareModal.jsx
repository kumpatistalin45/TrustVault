import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import {
  apiGetPermissions,
  apiGrantPermission,
  apiRevokePermission,
  apiGetEligibleUsers
} from "../../services/api";
import {
  Share2,
  UserPlus,
  Trash2,
  Shield,
  Eye,
  Edit3,
  CheckCircle2,
  ShieldCheck,
  Check,
  Search,
  Filter,
  Target,
  X,
  Plus,
  Users
} from "lucide-react";

function useSafeAuth() {
  try {
    return useAuth();
  } catch (_e) {
    return { user: null };
  }
}

export function ShareModal({
  isOpen,
  onClose,
  documentId,
  documentName = "Document",
  onPermissionsUpdated
}) {
  const { showToast } = useToast();
  const { user } = useSafeAuth();

  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [permissionLevel, setPermissionLevel] = useState("read"); // strictly 'read' or 'edit'
  const [grantLoading, setGrantLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  // Multi-user & search/filter state
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [exactMatch, setExactMatch] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);

  // Active access search & filter
  const [activeSearch, setActiveSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeExact, setActiveExact] = useState(false);

  // Revoke state
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  const fetchPermissions = useCallback(async () => {
    if (!documentId) return;
    setLoading(true);
    try {
      const res = await apiGetPermissions(documentId);
      setPermissions(res.permissions || []);
    } catch (err) {
      console.warn("Could not load permissions:", err.message);
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  const fetchEligibleUsers = useCallback(async (query, role, exact) => {
    setEligibleLoading(true);
    try {
      const res = await apiGetEligibleUsers({
        search: query,
        role: role,
        exact: exact,
        excludeEmail: user?.email
      });
      setEligibleUsers(res.users || []);
    } catch (_err) {
      setEligibleUsers([]);
    } finally {
      setEligibleLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && documentId) {
      setEmail("");
      setSelectedUsers([]);
      setFormError("");
      setIsReviewing(false);
      fetchPermissions();
      fetchEligibleUsers("", "all", false);
    }
  }, [isOpen, documentId, fetchPermissions, fetchEligibleUsers]);

  useEffect(() => {
    if (isOpen) {
      fetchEligibleUsers(email, roleFilter, exactMatch);
    }
  }, [email, roleFilter, exactMatch, isOpen, fetchEligibleUsers]);

  const handleToggleUser = (userItem) => {
    setSelectedUsers((prev) => {
      const exists = prev.some(
        (u) =>
          u.email?.toLowerCase() === userItem.email?.toLowerCase() ||
          (u.id && userItem.id && String(u.id) === String(userItem.id))
      );
      if (exists) {
        return prev.filter((u) => u.email?.toLowerCase() !== userItem.email?.toLowerCase());
      } else {
        return [...prev, userItem];
      }
    });
    setFormError("");
  };

  const handleRemoveUser = (emailToRemove) => {
    setSelectedUsers((prev) =>
      prev.filter((u) => u.email?.toLowerCase() !== emailToRemove.toLowerCase())
    );
  };

  const handleAddDirect = () => {
    const trimmed = email.trim();
    if (!trimmed) return;

    const match = eligibleUsers.find(
      (u) =>
        u.email?.toLowerCase() === trimmed.toLowerCase() ||
        (u.unique_id && u.unique_id.toLowerCase() === trimmed.toLowerCase()) ||
        String(u.id) === trimmed ||
        `#${u.id}` === trimmed
    );

    if (match) {
      if (!selectedUsers.some((u) => u.email?.toLowerCase() === match.email?.toLowerCase())) {
        setSelectedUsers((prev) => [...prev, match]);
      }
      setEmail("");
      setFormError("");
      return;
    }

    if (trimmed.includes("@")) {
      if (!selectedUsers.some((u) => u.email?.toLowerCase() === trimmed.toLowerCase())) {
        setSelectedUsers((prev) => [
          ...prev,
          {
            id: null,
            name: trimmed.split("@")[0],
            email: trimmed.toLowerCase(),
            unique_id: "Custom",
            role: "viewer"
          }
        ]);
      }
      setEmail("");
      setFormError("");
      return;
    }

    setFormError(`Could not find user matching "${trimmed}". Enter a valid corporate email.`);
  };

  const handleInitiateReview = (e) => {
    if (e) e.preventDefault();
    setFormError("");

    let usersToGrant = [...selectedUsers];
    const trimmed = email.trim();

    if (trimmed) {
      const alreadySelected = usersToGrant.some(
        (u) =>
          u.email?.toLowerCase() === trimmed.toLowerCase() ||
          (u.unique_id && u.unique_id.toLowerCase() === trimmed.toLowerCase()) ||
          String(u.id) === trimmed ||
          `#${u.id}` === trimmed
      );

      if (!alreadySelected) {
        const match = eligibleUsers.find(
          (u) =>
            u.email?.toLowerCase() === trimmed.toLowerCase() ||
            (u.unique_id && u.unique_id.toLowerCase() === trimmed.toLowerCase()) ||
            String(u.id) === trimmed ||
            `#${u.id}` === trimmed
        );

        if (match) {
          usersToGrant.push(match);
        } else if (trimmed.includes("@")) {
          usersToGrant.push({
            id: null,
            name: trimmed.split("@")[0],
            email: trimmed.toLowerCase(),
            unique_id: "Custom",
            role: "viewer"
          });
        }
      }
    }

    if (usersToGrant.length === 0) {
      setFormError("Please select or enter at least one eligible user (by email or unique ID).");
      return;
    }

    setSelectedUsers(usersToGrant);
    setIsReviewing(true);
  };

  const handleConfirmGrant = async () => {
    setGrantLoading(true);
    setFormError("");
    try {
      const usersToProcess = selectedUsers.length > 0 ? selectedUsers : [{ email: email.trim().toLowerCase() }];

      const results = await Promise.allSettled(
        usersToProcess.map((u) => {
          const payload = {
            email: u.email,
            permission: permissionLevel
          };
          if (u.id) payload.userId = u.id;
          if (u.unique_id && u.unique_id !== "Custom") payload.uniqueId = u.unique_id;
          return apiGrantPermission(documentId, payload);
        })
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      if (fulfilled.length > 0) {
        if (usersToProcess.length === 1) {
          showToast(`Access (${permissionLevel.toUpperCase()}) granted to ${usersToProcess[0].email}`, "success");
        } else {
          showToast(`Access (${permissionLevel.toUpperCase()}) granted to ${fulfilled.length} users.`, "success");
        }
        setEmail("");
        setSelectedUsers([]);
        setIsReviewing(false);
        await fetchPermissions();
        if (onPermissionsUpdated) onPermissionsUpdated();
      }

      if (rejected.length > 0) {
        const firstErr = rejected[0].reason?.message || "Failed to grant some permissions.";
        setFormError(firstErr);
        showToast(firstErr, "error");
      }
    } catch (err) {
      setFormError(err.message || "Could not grant permission. Ensure user is registered.");
    } finally {
      setGrantLoading(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await apiRevokePermission(documentId, revokeTarget.user_id);
      showToast(`Access revoked for ${revokeTarget.user_email || "user"}`, "success");
      setRevokeTarget(null);
      await fetchPermissions();
      if (onPermissionsUpdated) onPermissionsUpdated();
    } catch (err) {
      showToast(err.message || "Failed to revoke permission", "error");
    } finally {
      setRevokeLoading(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`Share "${documentName}"`} maxWidth="560px">
        <div>
          {/* Grant Access Form with Review step */}
          {!isReviewing ? (
            <form
              onSubmit={handleInitiateReview}
              style={{
                padding: "18px",
                background: "rgba(248, 250, 252, 0.9)",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                borderRadius: "20px",
                marginBottom: "20px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <UserPlus size={16} color="var(--brand-primary, #7C5CDB)" />
                  <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                    Grant Access to Eligible Users
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPicker(!showPicker)}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "9999px" }}
                >
                  <Users size={12} />
                  <span>{showPicker ? "Hide List" : "Browse Users"}</span>
                </button>
              </div>

              {/* Primary Input & Permission Level */}
              <div className="share-modal-form-grid" style={{ alignItems: "flex-start", marginBottom: "10px" }}>
                <div style={{ width: "100%", position: "relative" }}>
                  <input
                    type="text"
                    placeholder="colleague@trustvault.internal or Unique ID"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAddDirect();
                      }
                    }}
                    className="form-control"
                    style={{ fontSize: "13px", borderRadius: "12px", padding: "10px 45px 10px 14px", width: "100%", boxSizing: "border-box" }}
                  />
                  <button
                    type="button"
                    onClick={handleAddDirect}
                    className="btn btn-secondary btn-sm"
                    style={{
                      position: "absolute",
                      right: "5px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      borderRadius: "8px",
                      padding: "3px 7px",
                      fontSize: "11px",
                      height: "26px"
                    }}
                    title="Add user"
                  >
                    <Plus size={12} />
                    <span>Add</span>
                  </button>
                </div>

                <div style={{ width: "100%" }}>
                  <select
                    value={permissionLevel}
                    onChange={(e) => setPermissionLevel(e.target.value)}
                    className="form-control"
                    style={{ fontSize: "13px", borderRadius: "12px", padding: "10px 14px", width: "100%", boxSizing: "border-box" }}
                  >
                    <option value="read">Can Read</option>
                    <option value="edit">Can Edit</option>
                  </select>
                </div>
              </div>

              {/* Role filter & Exact Match toggle */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "8px",
                  padding: "6px 10px",
                  background: "#ffffff",
                  borderRadius: "10px",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  marginBottom: "12px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Filter size={11} color="var(--text-muted)" />
                  <select
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                    className="form-control"
                    style={{ fontSize: "11.5px", height: "26px", padding: "2px 6px", borderRadius: "6px" }}
                  >
                    <option value="all">All Roles</option>
                    <option value="viewer">Viewers</option>
                    <option value="owner">Owners</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setExactMatch(!exactMatch)}
                  className={`btn btn-sm ${exactMatch ? "btn-primary" : "btn-secondary"}`}
                  style={{ borderRadius: "6px", height: "26px", padding: "0 8px", fontSize: "11px", gap: "4px" }}
                  title="Exact Search"
                >
                  <Target size={12} />
                  <span>{exactMatch ? "Exact: ON" : "Exact: OFF"}</span>
                </button>
              </div>

              {/* Selected Recipients Tray */}
              {selectedUsers.length > 0 && (
                <div style={{ padding: "10px", background: "rgba(241, 245, 249, 0.9)", borderRadius: "12px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-primary)" }}>
                      Selected Users ({selectedUsers.length}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedUsers([])}
                      style={{ fontSize: "10.5px", color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id || u.email}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px",
                          background: "#ffffff",
                          border: "1px solid rgba(203, 213, 225, 0.8)",
                          padding: "2px 8px",
                          borderRadius: "9999px",
                          fontSize: "11px"
                        }}
                      >
                        <strong>{u.name || u.email}</strong>
                        <span style={{ fontSize: "10px", color: "var(--brand-primary, #7C5CDB)", fontFamily: "var(--font-mono)" }}>
                          {u.unique_id || `TV-USR-00${u.id}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveUser(u.email)}
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "var(--text-muted)" }}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Eligible Users Picker */}
              {(showPicker || email.trim() || exactMatch || roleFilter !== "all") && (
                <div
                  style={{
                    border: "1px solid rgba(226, 232, 240, 0.9)",
                    borderRadius: "12px",
                    background: "#ffffff",
                    padding: "10px",
                    marginBottom: "12px",
                    maxHeight: "160px",
                    overflowY: "auto"
                  }}
                >
                  <div style={{ fontSize: "11.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}>
                    Eligible Users ({eligibleUsers.length}):
                  </div>
                  {eligibleLoading ? (
                    <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-muted)", padding: "10px" }}>Loading...</div>
                  ) : eligibleUsers.length === 0 ? (
                    <div style={{ textAlign: "center", fontSize: "11px", color: "var(--text-muted)", padding: "10px" }}>No matching users found.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      {eligibleUsers.map((u) => {
                        const isSelected = selectedUsers.some((su) => su.email?.toLowerCase() === u.email?.toLowerCase());
                        return (
                          <div
                            key={u.id || u.email}
                            onClick={() => handleToggleUser(u)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "6px 8px",
                              borderRadius: "8px",
                              background: isSelected ? "rgba(124, 92, 219, 0.08)" : "rgba(248, 250, 252, 0.8)",
                              border: isSelected ? "1px solid rgba(124, 92, 219, 0.3)" : "1px solid rgba(241, 245, 249, 0.9)",
                              cursor: "pointer",
                              fontSize: "11.5px"
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontWeight: 600 }}>{u.name}</span>
                                <span style={{ fontSize: "9.5px", fontFamily: "var(--font-mono)", color: "var(--brand-primary, #7C5CDB)", fontWeight: 700 }}>
                                  {u.unique_id || `TV-USR-00${u.id}`}
                                </span>
                              </div>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{u.email}</span>
                            </div>
                            <span style={{ fontSize: "11px", color: isSelected ? "var(--brand-primary, #7C5CDB)" : "var(--text-muted)", fontWeight: 700 }}>
                              {isSelected ? "Selected ✓" : "+ Add"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {formError && (
                <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "8px" }}>
                  {formError}
                </span>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: "13px", padding: "8px 20px" }}
                >
                  Add Permission
                </button>
              </div>
            </form>
          ) : (
            <div
              style={{
                padding: "20px",
                background: "rgba(236, 253, 245, 0.9)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "20px",
                marginBottom: "22px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "#065f46" }}>
                <ShieldCheck size={16} />
                <strong style={{ fontSize: "13px", fontFamily: "var(--font-heading)" }}>
                  Review Permission Before Granting
                </strong>
              </div>

              <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>
                Granting <strong>{permissionLevel.toUpperCase()}</strong> permission for <em>{documentName}</em> to{" "}
                <strong>
                  {selectedUsers.length > 0
                    ? selectedUsers.map((u) => u.email).join(", ")
                    : email}
                </strong>.
              </div>

              {formError && (
                <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginBottom: "10px" }}>
                  {formError}
                </span>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsReviewing(false)}
                  disabled={grantLoading}
                  style={{ fontSize: "12px", padding: "6px 14px" }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleConfirmGrant}
                  disabled={grantLoading}
                  style={{ fontSize: "12px", padding: "6px 18px" }}
                >
                  {grantLoading ? "Confirming..." : "Confirm & Grant"}
                </button>
              </div>
            </div>
          )}

          {/* Active Collaborators Section with Search & Filter */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: "10px"
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                Active Access List ({permissions.length})
              </span>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Revocations take effect immediately
              </span>
            </div>

            {/* Filter controls */}
            {permissions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", flexWrap: "wrap" }}>
                <input
                  type="text"
                  placeholder="Filter by name, email, #ID..."
                  value={activeSearch}
                  onChange={(e) => setActiveSearch(e.target.value)}
                  className="form-control"
                  style={{ fontSize: "11.5px", height: "30px", flex: "1 1 140px", borderRadius: "8px" }}
                />
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="form-control"
                  style={{ fontSize: "11.5px", height: "30px", width: "auto", borderRadius: "8px" }}
                >
                  <option value="all">All</option>
                  <option value="read">Read</option>
                  <option value="edit">Edit</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveExact(!activeExact)}
                  className={`btn btn-sm ${activeExact ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "10.5px", height: "30px", borderRadius: "8px", padding: "0 8px" }}
                  title="Exact match"
                >
                  Exact
                </button>
              </div>
            )}

            {loading ? (
              <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "13px" }}>
                Loading permission records...
              </div>
            ) : permissions.length === 0 ? (
              <div
                style={{
                  padding: "24px",
                  textAlign: "center",
                  background: "rgba(248, 250, 252, 0.6)",
                  border: "1px dashed rgba(226, 232, 240, 0.9)",
                  borderRadius: "18px",
                  color: "var(--text-muted)",
                  fontSize: "13px"
                }}
              >
                No external permissions granted yet. Only you have access to this document.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  WebkitOverflowScrolling: "touch"
                }}
              >
                {permissions
                  .filter((p) => {
                    if (activeFilter !== "all" && p.permission !== activeFilter) return false;
                    if (activeSearch.trim()) {
                      const q = activeSearch.trim().toLowerCase();
                      const pName = (p.user_name || "").toLowerCase();
                      const pEmail = (p.user_email || "").toLowerCase();
                      const pUnique = (p.unique_id || `TV-USR-00${p.user_id}`).toLowerCase();
                      const pId = String(p.user_id || "");
                      if (activeExact) {
                        return pEmail === q || pUnique === q || `#${pId}` === q || pId === q || pName === q;
                      } else {
                        return pEmail.includes(q) || pUnique.includes(q) || `#${pId}`.includes(q) || pId.includes(q) || pName.includes(q);
                      }
                    }
                    return true;
                  })
                  .map((p) => (
                    <div
                      key={p.id || p.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "10px",
                        padding: "10px 14px",
                        background: "rgba(248, 250, 252, 0.8)",
                        border: "1px solid rgba(226, 232, 240, 0.9)",
                        borderRadius: "14px"
                      }}
                    >
                      <div style={{ minWidth: 0, flex: "1 1 180px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              display: "block",
                              fontSize: "13px",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                              wordBreak: "break-word"
                            }}
                          >
                            {p.user_name || p.user_email}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              color: "var(--brand-primary, #7C5CDB)",
                              background: "rgba(124, 92, 219, 0.08)",
                              padding: "1px 5px",
                              borderRadius: "4px"
                            }}
                          >
                            {p.unique_id || `TV-USR-00${p.user_id}`}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: "11.5px",
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-mono)",
                            wordBreak: "break-all",
                            display: "block"
                          }}
                        >
                          {p.user_email}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                        <span
                          style={{
                            background: p.permission === "edit" ? "rgba(16, 185, 129, 0.12)" : "rgba(15, 23, 42, 0.08)",
                            color: p.permission === "edit" ? "#059669" : "#0f172a",
                            padding: "3px 10px",
                            borderRadius: "9999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {p.permission === "edit" ? "Can Edit" : "Can Read"}
                        </span>
                        <button
                          onClick={() => setRevokeTarget(p)}
                          className="btn-circle"
                          style={{
                            width: "30px",
                            height: "30px",
                            color: "#ef4444",
                            borderColor: "rgba(239, 68, 68, 0.2)",
                            flexShrink: 0
                          }}
                          title="Revoke Access"
                          aria-label={`Revoke access for ${p.user_email}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: "24px",
              paddingTop: "16px",
              borderTop: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: "13px", padding: "8px 20px" }}>
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Revoke Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevokeConfirm}
        title="Revoke Document Permission"
        message={`Are you sure you want to revoke access for ${revokeTarget?.user_email || "this user"}? They will immediately lose decryption and access capabilities.`}
        confirmText="Revoke Access"
        confirmVariant="danger"
        loading={revokeLoading}
      />
    </>
  );
}

export default ShareModal;
