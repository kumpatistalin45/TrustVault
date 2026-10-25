import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import {
  apiGetDocument,
  apiGetDocuments,
  apiGetPermissions,
  apiGrantPermission,
  apiRevokePermission,
  apiGetEligibleUsers
} from "../services/api";
import { formatFileSize, formatDate } from "../services/mockData";
import { UserAvatar } from "../components/common/UserAvatar";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { TableSkeleton } from "../components/common/Skeleton";
import {
  UserPlus,
  Users,
  Shield,
  ShieldCheck,
  Trash2,
  Mail,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Lock,
  FileText,
  ShieldAlert,
  Info,
  Check,
  RotateCcw,
  KeyRound,
  ChevronDown,
  Search,
  Filter,
  Target,
  X,
  Plus,
  UserCheck
} from "lucide-react";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.matchMedia) {
      return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
    }
    return (window.innerWidth || 1024) <= breakpoint;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia) {
      const media = window.matchMedia(`(max-width: ${breakpoint}px)`);
      const update = (e) => setIsMobile(e.matches);
      if (media.addEventListener) {
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
      } else if (media.addListener) {
        media.addListener(update);
        return () => media.removeListener(update);
      }
    }
    const handleResize = () => setIsMobile((window.innerWidth || 1024) <= breakpoint);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [breakpoint]);

  return isMobile;
}

export function PermissionsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile(768);

  const [availableDocs, setAvailableDocs] = useState([]);
  const [document, setDocument] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Grant form state (supports single typing or multi-user batch selection)
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPermissionLevel, setGrantPermissionLevel] = useState("read"); // 'read' or 'edit' only
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantError, setGrantError] = useState("");

  // Multi-user & search/filter state for owner grant
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");
  const [exactMatch, setExactMatch] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);

  // Active Collaborators search & filter state
  const [collabSearch, setCollabSearch] = useState("");
  const [collabPermFilter, setCollabPermFilter] = useState("all");
  const [collabExact, setCollabExact] = useState(false);

  // Review step before submitting
  const [isReviewing, setIsReviewing] = useState(false);

  // Revoke confirmation state
  const [revokeUser, setRevokeUser] = useState(null);
  const [revokeLoading, setRevokeLoading] = useState(false);

  // Fetch eligible users based on search, role, and exact toggle
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
    fetchEligibleUsers(grantEmail, roleFilter, exactMatch);
  }, [grantEmail, roleFilter, exactMatch, fetchEligibleUsers]);

  const handleToggleUser = (userItem) => {
    setSelectedUsers((prev) => {
      const exists = prev.some(
        (u) =>
          u.email.toLowerCase() === userItem.email.toLowerCase() ||
          (u.id && userItem.id && String(u.id) === String(userItem.id))
      );
      if (exists) {
        return prev.filter((u) => u.email.toLowerCase() !== userItem.email.toLowerCase());
      } else {
        return [...prev, userItem];
      }
    });
    setGrantError("");
  };

  const handleRemoveUser = (emailToRemove) => {
    setSelectedUsers((prev) =>
      prev.filter((u) => u.email.toLowerCase() !== emailToRemove.toLowerCase())
    );
  };

  const handleAddDirect = () => {
    const trimmed = grantEmail.trim();
    if (!trimmed) return;

    // Check if matches an eligible user
    const match = eligibleUsers.find(
      (u) =>
        u.email.toLowerCase() === trimmed.toLowerCase() ||
        (u.unique_id && u.unique_id.toLowerCase() === trimmed.toLowerCase()) ||
        String(u.id) === trimmed ||
        `#${u.id}` === trimmed
    );

    if (match) {
      if (!selectedUsers.some((u) => u.email.toLowerCase() === match.email.toLowerCase())) {
        setSelectedUsers((prev) => [...prev, match]);
      }
      setGrantEmail("");
      setGrantError("");
      return;
    }

    if (trimmed.includes("@")) {
      if (!selectedUsers.some((u) => u.email.toLowerCase() === trimmed.toLowerCase())) {
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
      setGrantEmail("");
      setGrantError("");
      return;
    }

    setGrantError(`Could not find user matching "${trimmed}". Select from eligible list or enter a valid corporate email.`);
  };

  const handleSelectAllFiltered = () => {
    const newSelected = [...selectedUsers];
    eligibleUsers.forEach((eu) => {
      if (!newSelected.some((u) => u.email.toLowerCase() === eu.email.toLowerCase())) {
        newSelected.push(eu);
      }
    });
    setSelectedUsers(newSelected);
  };

  const handleClearSelected = () => {
    setSelectedUsers([]);
    setGrantEmail("");
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let docRes = null;
      let effectiveId = id;

      try {
        docRes = await apiGetDocument(effectiveId);
      } catch (_err) {
        docRes = null;
      }

      if (!docRes?.document) {
        const docsRes = await apiGetDocuments({ limit: 100 });
        const owned = (docsRes?.documents || []).filter(
          (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
        );
        setAvailableDocs(owned);
        if (owned.length > 0) {
          effectiveId = owned[0].id;
          docRes = await apiGetDocument(effectiveId);
        }
      }

      if (!docRes?.document) {
        throw new Error("Document not found or inaccessible.");
      }

      // Verify owner status
      const isOwner =
        String(docRes.document.owner_id) === String(user?.id) ||
        docRes.document.access_level === "owner";

      if (!isOwner && user?.role !== "admin") {
        throw new Error("Discretionary access control violation: Only the document owner can inspect or modify permissions.");
      }

      setDocument(docRes.document);

      const permRes = await apiGetPermissions(effectiveId || docRes.document.id);
      setPermissions(permRes.permissions || []);

      // Background non-blocking load of other owned documents for selector if not already loaded
      apiGetDocuments({ limit: 100 })
        .then((res) => {
          const owned = (res?.documents || []).filter(
            (d) => String(d.owner_id) === String(user?.id) || d.access_level === "owner"
          );
          setAvailableDocs(owned);
        })
        .catch(() => {});
    } catch (err) {
      setError(err.message || "Could not load permissions. Owner privileges required.");
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDocumentChange = (e) => {
    const nextId = e.target.value;
    navigate(`/documents/${nextId}/permissions`);
  };

  // Review step toggle (handles single email input or multi-user batch)
  const handleInitiateReview = (e) => {
    if (e) e.preventDefault();
    setGrantError("");

    let usersToGrant = [...selectedUsers];

    const trimmedInput = grantEmail.trim();
    if (trimmedInput) {
      const alreadySelected = usersToGrant.some(
        (u) =>
          u.email?.toLowerCase() === trimmedInput.toLowerCase() ||
          (u.unique_id && u.unique_id.toLowerCase() === trimmedInput.toLowerCase()) ||
          String(u.id) === trimmedInput ||
          `#${u.id}` === trimmedInput
      );

      if (!alreadySelected) {
        const match = eligibleUsers.find(
          (u) =>
            u.email?.toLowerCase() === trimmedInput.toLowerCase() ||
            (u.unique_id && u.unique_id.toLowerCase() === trimmedInput.toLowerCase()) ||
            String(u.id) === trimmedInput ||
            `#${u.id}` === trimmedInput
        );

        if (match) {
          usersToGrant.push(match);
        } else if (trimmedInput.includes("@")) {
          usersToGrant.push({
            id: null,
            name: trimmedInput.split("@")[0],
            email: trimmedInput.toLowerCase(),
            unique_id: "Custom",
            role: "viewer"
          });
        }
      }
    }

    if (usersToGrant.length === 0) {
      setGrantError("Please select or enter at least one eligible user (by corporate email or Unique ID).");
      return;
    }

    const selfUser = usersToGrant.find(
      (u) => u.email?.toLowerCase() === user?.email?.toLowerCase()
    );
    if (selfUser) {
      setGrantError("You already own this document. You cannot grant permissions to yourself.");
      return;
    }

    // Check duplicate existing permissions
    const alreadyGrantedUsers = usersToGrant.filter((u) => {
      const existing = permissions.find((p) => p.user_email?.toLowerCase() === u.email?.toLowerCase());
      return existing && existing.permission === grantPermissionLevel;
    });

    if (alreadyGrantedUsers.length === usersToGrant.length) {
      if (usersToGrant.length === 1) {
        setGrantError(`This user already has ${grantPermissionLevel.toUpperCase()} access.`);
      } else {
        setGrantError(`All selected users already have ${grantPermissionLevel.toUpperCase()} access.`);
      }
      return;
    }

    setSelectedUsers(usersToGrant);
    setIsReviewing(true);
  };

  // Final submit after review
  const handleConfirmGrant = async () => {
    setGrantLoading(true);
    setGrantError("");
    try {
      const usersToProcess = selectedUsers.length > 0 ? selectedUsers : [{ email: grantEmail.trim().toLowerCase() }];

      const results = await Promise.allSettled(
        usersToProcess.map((u) => {
          const payload = {
            email: u.email,
            permission: grantPermissionLevel
          };
          if (u.id) payload.userId = u.id;
          if (u.unique_id && u.unique_id !== "Custom") payload.uniqueId = u.unique_id;
          return apiGrantPermission(id, payload);
        })
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      if (fulfilled.length > 0) {
        if (usersToProcess.length === 1) {
          showToast(`Permission (${grantPermissionLevel.toUpperCase()}) granted to ${usersToProcess[0].email}`, "success");
        } else {
          showToast(`Permission (${grantPermissionLevel.toUpperCase()}) granted to ${fulfilled.length} users.`, "success");
        }
        setGrantEmail("");
        setSelectedUsers([]);
        setGrantPermissionLevel("read");
        setIsReviewing(false);
        await loadData();
      }

      if (rejected.length > 0) {
        const firstErr = rejected[0].reason?.message || "Some permissions could not be granted.";
        setGrantError(firstErr);
        showToast(firstErr, "error");
      }
    } catch (err) {
      setGrantError(err.message || "Failed to grant permission. Ensure target user is registered.");
      showToast(err.message || "Failed to grant access", "error");
    } finally {
      setGrantLoading(false);
    }
  };

  // Revoke confirmation handler
  const handleRevokeConfirm = async () => {
    if (!revokeUser) return;
    setRevokeLoading(true);
    try {
      await apiRevokePermission(id, revokeUser.user_id);
      showToast(`Access revoked for ${revokeUser.user_email || "user"}.`, "success");
      setRevokeUser(null);
      await loadData();
    } catch (err) {
      showToast(err.message || "Revocation failed", "error");
    } finally {
      setRevokeLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: "860px", margin: "40px auto" }} className="animate-fade-in">
        <div className="card-white responsive-page-card" style={{ borderRadius: "28px" }}>
          <TableSkeleton rows={5} />
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div style={{ maxWidth: "600px", margin: "40px auto" }} className="animate-fade-in">
        <div className="card-white responsive-page-card" style={{ padding: "48px 24px", textAlign: "center", borderRadius: "28px" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              background: "rgba(124, 92, 219, 0.12)",
              border: "1px solid rgba(124, 92, 219, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--brand-primary, #7C5CDB)",
              marginBottom: "16px"
            }}
          >
            {error ? <ShieldAlert size={32} color="#dc2626" /> : <KeyRound size={32} />}
          </div>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "8px"
            }}
          >
            {error ? "Access Denied / Ownership Required" : "No Owned Documents"}
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, marginBottom: "24px" }}>
            {error || "You haven't uploaded any documents yet. Upload a document to manage discretionary Read/Edit permissions."}
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
            <Link to="/documents/upload" className="btn btn-primary" style={{ borderRadius: "9999px", textDecoration: "none" }}>
              Upload Document
            </Link>
            <Link to="/dashboard" className="btn btn-secondary" style={{ borderRadius: "9999px", textDecoration: "none" }}>
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const backLink = id ? `/documents/${id}` : "/dashboard";
  const backLabel = id ? "Back to Document Details" : "Back to Owner Dashboard";

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }} className="animate-fade-in">
      {/* Return Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
        <Link
          to={backLink}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "13px",
            color: "var(--text-secondary)",
            fontWeight: 600,
            textDecoration: "none",
            background: "rgba(255, 255, 255, 0.65)",
            padding: "8px 16px",
            borderRadius: "9999px",
            border: "1px solid rgba(255, 255, 255, 0.8)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)"
          }}
        >
          <ArrowLeft size={15} />
          <span>{backLabel}</span>
        </Link>

        <button
          onClick={loadData}
          className="btn btn-secondary btn-sm"
          style={{ borderRadius: "9999px", gap: "6px" }}
          title="Refresh Permissions"
        >
          <RotateCcw size={13} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Permissions Card */}
      <div className="card-white responsive-page-card" style={{ borderRadius: "28px" }}>
        {/* Document Selector (When owner has multiple documents) */}
        {availableDocs.length > 1 && (
          <div
            style={{
              marginBottom: "20px",
              padding: "14px 18px",
              background: "rgba(248, 250, 252, 0.8)",
              borderRadius: "18px",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "10px"
            }}
          >
            <label
              htmlFor="permissions-doc-select"
              style={{
                fontSize: "12px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <FileText size={14} color="var(--brand-primary, #7C5CDB)" />
              <span>Select Document to Manage:</span>
            </label>
            <select
              id="permissions-doc-select"
              value={document.id}
              onChange={handleDocumentChange}
              className="form-control"
              style={{
                borderRadius: "12px",
                padding: "8px 14px",
                fontSize: "13px",
                maxWidth: "340px",
                width: "100%",
                background: "#ffffff"
              }}
            >
              {availableDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.category || "General"})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Document Header Info */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "24px", paddingBottom: "18px", borderBottom: "1px solid rgba(226, 232, 240, 0.8)", flexWrap: "wrap" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "14px",
              background: "var(--role-accent-soft, rgba(124, 92, 219, 0.12))",
              color: "var(--brand-primary, #7C5CDB)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            <FileText size={22} />
          </div>

          <div style={{ minWidth: 0, flex: "1 1 240px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "19px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  lineHeight: 1.3
                }}
              >
                Manage Permissions: {document.name}
              </h1>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "3px 9px",
                  borderRadius: "9999px",
                  background: "var(--role-accent-soft, rgba(124, 92, 219, 0.12))",
                  color: "var(--brand-primary, #7C5CDB)",
                  textTransform: "uppercase",
                  whiteSpace: "nowrap"
                }}
              >
                Owner Controlled
              </span>
            </div>

            <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "4px 0 0 0", wordBreak: "break-word" }}>
              Document ID: #{document.id} • Classification: {document.category || "General"} • {formatFileSize(document.size_bytes)}
            </p>
          </div>
        </div>

        {/* Integration Boundary Notice */}
        <div
          style={{
            padding: "14px 16px",
            background: "rgba(248, 250, 252, 0.8)",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            borderRadius: "16px",
            display: "flex",
            alignItems: "flex-start",
            gap: "10px",
            marginBottom: "24px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            lineHeight: 1.5
          }}
        >
          <Info size={16} color="var(--brand-primary, #7C5CDB)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <span>
            <strong>Discretionary Access Control:</strong> You can grant <em>Read</em> (decryption only) or <em>Edit</em> (decryption + metadata modification) permissions to registered TrustVault users. You cannot grant Admin or Owner roles, or change global roles.
          </span>
        </div>

        {/* Grant Permission Form / Review Step */}
        {!isReviewing ? (
          /* Step 1: Input Form & Multi-User Eligible Picker */
          <form
            onSubmit={handleInitiateReview}
            style={{
              padding: "20px",
              background: "rgba(248, 250, 252, 0.9)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              borderRadius: "20px",
              marginBottom: "28px"
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <UserPlus size={16} color="var(--brand-primary, #7C5CDB)" />
                  <strong style={{ fontSize: "14px", color: "var(--text-primary)", fontFamily: "var(--font-heading)" }}>
                    Grant Document Access to Eligible Users
                  </strong>
                </div>
                <p style={{ margin: "3px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                  Select multiple users by Email ID or Unique ID (TV-USR-00X) • Exact search & role filtering
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowPicker(!showPicker)}
                className="btn btn-secondary btn-sm"
                style={{ borderRadius: "9999px", padding: "5px 14px", fontSize: "12px", gap: "5px" }}
              >
                <Users size={13} />
                <span>{showPicker ? "Hide User List" : "Browse Eligible Users"}</span>
              </button>
            </div>

            {/* Primary Input & Permission Level Grid */}
            <div className="permissions-grant-grid" style={{ alignItems: "flex-start", marginBottom: "12px" }}>
              {/* Search / Email / Unique ID Input */}
              <div style={{ width: "100%", position: "relative" }}>
                <input
                  type="text"
                  placeholder="registered.user@trustvault.internal (or search by Unique ID TV-USR-001)"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAddDirect();
                    }
                  }}
                  className="form-control"
                  style={{
                    borderRadius: "12px",
                    padding: "10px 48px 10px 14px",
                    fontSize: "13px",
                    width: "100%",
                    boxSizing: "border-box"
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddDirect}
                  className="btn btn-secondary btn-sm"
                  style={{
                    position: "absolute",
                    right: "6px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    borderRadius: "8px",
                    padding: "4px 8px",
                    fontSize: "11px",
                    gap: "3px",
                    height: "28px"
                  }}
                  title="Add user to selection list"
                >
                  <Plus size={12} />
                  <span>Add</span>
                </button>
              </div>

              {/* Permission Level Selector */}
              <div style={{ width: "100%" }}>
                <select
                  value={grantPermissionLevel}
                  onChange={(e) => setGrantPermissionLevel(e.target.value)}
                  className="form-control"
                  style={{ borderRadius: "12px", padding: "10px 14px", fontSize: "13px", width: "100%", boxSizing: "border-box" }}
                >
                  <option value="read">Can Read (Decrypt)</option>
                  <option value="edit">Can Edit (Modify)</option>
                </select>
              </div>
            </div>

            {/* Filter Bar: Role Filter + Exact Search Toggle */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "10px",
                marginBottom: "14px",
                padding: "8px 12px",
                background: "rgba(255, 255, 255, 0.75)",
                borderRadius: "12px",
                border: "1px solid rgba(226, 232, 240, 0.9)"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px", marginRight: "2px" }}>
                  <Filter size={12} /> Role:
                </span>
                {[
                  { value: "all", label: "All" },
                  { value: "viewer", label: "Viewers" },
                  { value: "owner", label: "Owners" },
                  { value: "admin", label: "Admins" }
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRoleFilter(r.value)}
                    className={`btn btn-sm ${roleFilter === r.value ? "btn-primary" : "btn-secondary"}`}
                    style={{
                      borderRadius: "8px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      height: "26px"
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setExactMatch(!exactMatch)}
                  className={`btn btn-sm ${exactMatch ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    borderRadius: "8px",
                    padding: "4px 10px",
                    fontSize: "11.5px",
                    height: "30px",
                    gap: "5px"
                  }}
                  title="Exact Search: matches exact email or Unique ID (TV-USR-00X)"
                >
                  <Target size={13} />
                  <span>{exactMatch ? "Exact Search: ON" : "Exact Search: OFF"}</span>
                </button>

                {grantEmail && (
                  <button
                    type="button"
                    onClick={() => setGrantEmail("")}
                    className="btn btn-secondary btn-sm"
                    style={{ borderRadius: "8px", padding: "4px 8px", fontSize: "11px", height: "30px" }}
                  >
                    Clear Input
                  </button>
                )}
              </div>
            </div>

            {/* Selected Recipients Pill Tray */}
            {selectedUsers.length > 0 && (
              <div
                style={{
                  padding: "12px 14px",
                  background: "rgba(241, 245, 249, 0.9)",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  marginBottom: "14px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>
                    Selected Recipients ({selectedUsers.length}):
                  </span>
                  <button
                    type="button"
                    onClick={handleClearSelected}
                    style={{ fontSize: "11px", color: "#dc2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                  >
                    Clear All
                  </button>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {selectedUsers.map((u) => (
                    <div
                      key={u.id || u.email}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        background: "#ffffff",
                        border: "1px solid rgba(203, 213, 225, 0.9)",
                        padding: "3px 8px 3px 6px",
                        borderRadius: "9999px",
                        fontSize: "12px"
                      }}
                    >
                      <UserAvatar user={{ name: u.name || u.email }} size={18} />
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {u.name || u.email.split("@")[0]}
                      </span>
                      <span style={{ fontSize: "10.5px", color: "var(--brand-primary, #7C5CDB)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {u.unique_id || `TV-USR-00${u.id}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveUser(u.email)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: "0 2px",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center"
                        }}
                        title={`Remove ${u.email}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Eligible Users Picker / Search Results */}
            {(showPicker || grantEmail.trim() || exactMatch || roleFilter !== "all") && (
              <div
                style={{
                  border: "1px solid rgba(226, 232, 240, 0.9)",
                  borderRadius: "14px",
                  background: "#ffffff",
                  padding: "12px",
                  marginBottom: "14px",
                  maxHeight: "220px",
                  overflowY: "auto"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-secondary)" }}>
                    Eligible Users ({eligibleUsers.length} found{exactMatch ? " • Exact Match" : ""}):
                  </span>
                  {eligibleUsers.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px" }}
                    >
                      Select All Filtered
                    </button>
                  )}
                </div>

                {eligibleLoading ? (
                  <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                    Searching eligible users...
                  </div>
                ) : eligibleUsers.length === 0 ? (
                  <div style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                    No eligible users found. Try searching by Email ID or Unique ID (TV-USR-00X).
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {eligibleUsers.map((u) => {
                      const isSelected = selectedUsers.some(
                        (su) => su.email?.toLowerCase() === u.email?.toLowerCase()
                      );
                      const alreadyHasAccess = permissions.some(
                        (p) => p.user_email?.toLowerCase() === u.email?.toLowerCase()
                      );

                      return (
                        <div
                          key={u.id || u.email}
                          onClick={() => handleToggleUser(u)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 10px",
                            borderRadius: "10px",
                            background: isSelected ? "rgba(124, 92, 219, 0.08)" : "rgba(248, 250, 252, 0.8)",
                            border: isSelected ? "1px solid rgba(124, 92, 219, 0.4)" : "1px solid rgba(241, 245, 249, 0.9)",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            gap: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: "1 1 auto" }}>
                            <UserAvatar user={{ name: u.name || u.email }} size={24} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                                  {u.name}
                                </span>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontFamily: "var(--font-mono)",
                                    fontWeight: 700,
                                    padding: "1px 5px",
                                    background: "rgba(124, 92, 219, 0.1)",
                                    color: "var(--brand-primary, #7C5CDB)",
                                    borderRadius: "4px"
                                  }}
                                >
                                  {u.unique_id || `TV-USR-00${u.id}`}
                                </span>
                                <span
                                  style={{
                                    fontSize: "10px",
                                    textTransform: "uppercase",
                                    padding: "1px 5px",
                                    borderRadius: "4px",
                                    background: "rgba(15, 23, 42, 0.06)",
                                    color: "var(--text-secondary)"
                                  }}
                                >
                                  {u.role}
                                </span>
                                {alreadyHasAccess && (
                                  <span style={{ fontSize: "10px", color: "#059669", fontWeight: 600 }}>
                                    (Has Access)
                                  </span>
                                )}
                              </div>
                              <span style={{ fontSize: "11.5px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)", display: "block" }}>
                                {u.email}
                              </span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleUser(u);
                            }}
                            className={`btn btn-sm ${isSelected ? "btn-primary" : "btn-secondary"}`}
                            style={{
                              borderRadius: "6px",
                              padding: "3px 9px",
                              fontSize: "11px",
                              gap: "4px",
                              flexShrink: 0
                            }}
                          >
                            {isSelected ? (
                              <>
                                <Check size={12} />
                                <span>Selected</span>
                              </>
                            ) : (
                              <>
                                <Plus size={12} />
                                <span>Select</span>
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {grantError && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "10px" }}>
                {grantError}
              </span>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ borderRadius: "9999px", padding: "8px 20px", fontSize: "13px", gap: "6px" }}
              >
                <span>Review & Confirm</span>
                <Check size={14} />
              </button>
            </div>
          </form>
        ) : (
          /* Step 2: Review Before Submitting */
          <div
            style={{
              padding: "20px",
              background: "rgba(236, 253, 245, 0.8)",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              borderRadius: "20px",
              marginBottom: "28px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "#065f46" }}>
              <ShieldCheck size={17} />
              <strong style={{ fontSize: "13.5px", fontFamily: "var(--font-heading)" }}>
                Review Permission Change Before Submitting
              </strong>
            </div>

            <div
              style={{
                background: "#ffffff",
                padding: "16px 18px",
                borderRadius: "14px",
                border: "1px solid rgba(226, 232, 240, 0.9)",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                fontSize: "12.5px"
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)", fontWeight: 500, display: "block", marginBottom: "6px" }}>
                  Recipient{selectedUsers.length > 1 ? `s (${selectedUsers.length})` : ""}:
                </span>
                {selectedUsers.length > 1 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {selectedUsers.map((u) => (
                      <div
                        key={u.id || u.email}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          background: "rgba(241, 245, 249, 0.9)",
                          border: "1px solid rgba(203, 213, 225, 0.8)",
                          padding: "4px 10px",
                          borderRadius: "9999px",
                          fontSize: "12px"
                        }}
                      >
                        <UserAvatar user={{ name: u.name || u.email }} size={18} />
                        <strong style={{ color: "var(--text-primary)" }}>{u.email}</strong>
                        <span style={{ fontSize: "10.5px", color: "var(--brand-primary, #7C5CDB)", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                          {u.unique_id || `TV-USR-00${u.id}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Recipient: </span>
                    <strong style={{ color: "var(--text-primary)", wordBreak: "break-all" }}>
                      {selectedUsers[0]?.email || grantEmail}
                    </strong>
                    {(selectedUsers[0]?.unique_id || (grantEmail && !grantEmail.includes("@"))) && (
                      <span style={{ marginLeft: "8px", fontSize: "11px", padding: "2px 6px", background: "rgba(124, 92, 219, 0.1)", color: "var(--brand-primary, #7C5CDB)", borderRadius: "6px", fontFamily: "var(--font-mono)" }}>
                        {selectedUsers[0]?.unique_id || grantEmail}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Permission Level: </span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    background: grantPermissionLevel === "edit" ? "rgba(16, 185, 129, 0.15)" : "rgba(15, 23, 42, 0.08)",
                    color: grantPermissionLevel === "edit" ? "#059669" : "#0f172a"
                  }}
                >
                  {grantPermissionLevel === "edit" ? "Can Edit (Modify & Decrypt)" : "Can Read (Decrypt Only)"}
                </span>
              </div>

              <div>
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>Scope: </span>
                <span>Document #{document.id} only. Does not alter recipients' global system roles.</span>
              </div>
            </div>

            {grantError && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", marginTop: "10px" }}>
                {grantError}
              </span>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsReviewing(false)}
                disabled={grantLoading}
                style={{ borderRadius: "9999px", padding: "6px 16px" }}
              >
                <span>Back</span>
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmGrant}
                disabled={grantLoading}
                style={{ borderRadius: "9999px", padding: "8px 22px" }}
              >
                <span>{grantLoading ? "Submitting to Server..." : "Confirm & Grant Access"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Collaborators Section */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "14px" }}>
            <div>
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
                Active Discretionary Permissions ({permissions.filter((p) => {
                  if (collabPermFilter !== "all" && p.permission !== collabPermFilter) return false;
                  if (collabSearch.trim()) {
                    const q = collabSearch.trim().toLowerCase();
                    const pName = (p.user_name || "").toLowerCase();
                    const pEmail = (p.user_email || "").toLowerCase();
                    const pUniqueId = (p.unique_id || `TV-USR-00${p.user_id}`).toLowerCase();
                    const pId = String(p.user_id || "");
                    if (collabExact) {
                      return pEmail === q || pUniqueId === q || `#${pId}` === q || pId === q || pName === q;
                    } else {
                      return pEmail.includes(q) || pUniqueId.includes(q) || `#${pId}`.includes(q) || pId.includes(q) || pName.includes(q);
                    }
                  }
                  return true;
                }).length}{permissions.length > 0 ? ` of ${permissions.length}` : ""})
              </h3>
              <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                Revocations take effect immediately on next server check
              </span>
            </div>

            {/* Active Collaborators Exact Search & Filter Controls */}
            {permissions.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
                {/* Search Input */}
                <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 220px" }}>
                  <Search size={13} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    placeholder="Search by Name, Email, #ID..."
                    value={collabSearch}
                    onChange={(e) => setCollabSearch(e.target.value)}
                    className="form-control"
                    style={{ paddingLeft: "30px", paddingRight: collabSearch ? "26px" : "10px", fontSize: "12px", height: "34px", borderRadius: "10px", width: "100%" }}
                  />
                  {collabSearch && (
                    <button
                      type="button"
                      onClick={() => setCollabSearch("")}
                      style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "2px", color: "var(--text-muted)" }}
                      title="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Permission Filter Buttons */}
                <div style={{ display: "inline-flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(203, 213, 225, 0.9)" }}>
                  {[
                    { value: "all", label: "All" },
                    { value: "read", label: "Read" },
                    { value: "edit", label: "Edit" }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCollabPermFilter(opt.value)}
                      className={`btn btn-sm ${collabPermFilter === opt.value ? "btn-primary" : "btn-secondary"}`}
                      style={{
                        borderRadius: "0",
                        height: "32px",
                        padding: "0 8px",
                        fontSize: "11px",
                        border: "none"
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Exact Match Toggle */}
                <button
                  type="button"
                  onClick={() => setCollabExact(!collabExact)}
                  className={`btn btn-sm ${collabExact ? "btn-primary" : "btn-secondary"}`}
                  style={{
                    borderRadius: "10px",
                    height: "34px",
                    padding: "0 10px",
                    fontSize: "11.5px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    flex: isMobile ? "1 1 calc(50% - 4px)" : "none"
                  }}
                  title="Toggle exact match search"
                >
                  <Target size={13} />
                  <span>Exact</span>
                </button>

                {(collabSearch || collabPermFilter !== "all" || collabExact) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCollabSearch("");
                      setCollabPermFilter("all");
                      setCollabExact(false);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ borderRadius: "10px", height: "34px", padding: "0 10px", fontSize: "11.5px" }}
                    title="Reset filters"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>

          {permissions.length === 0 ? (
            <div
              style={{
                padding: "32px 18px",
                textAlign: "center",
                background: "rgba(248, 250, 252, 0.6)",
                border: "1px dashed rgba(226, 232, 240, 0.9)",
                borderRadius: "18px",
                color: "var(--text-muted)",
                fontSize: "13px"
              }}
            >
              No discretionary permissions have been granted to external users. Only you have access to this document.
            </div>
          ) : !isMobile ? (
            /* Desktop Table View (>= 768px) */
            <div className="table-container" style={{ borderRadius: "18px" }}>
              <table className="vault-table">
                <thead>
                  <tr>
                    <th>Authorized Collaborator</th>
                    <th>Email Address</th>
                    <th>Unique ID</th>
                    <th>Permission Level</th>
                    <th>Granted Date</th>
                    <th style={{ textAlign: "right" }}>Revoke Access</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions
                    .filter((p) => {
                      if (collabPermFilter !== "all" && p.permission !== collabPermFilter) return false;
                      if (collabSearch.trim()) {
                        const q = collabSearch.trim().toLowerCase();
                        const pName = (p.user_name || "").toLowerCase();
                        const pEmail = (p.user_email || "").toLowerCase();
                        const pUniqueId = (p.unique_id || `TV-USR-00${p.user_id}`).toLowerCase();
                        const pId = String(p.user_id || "");
                        if (collabExact) {
                          return pEmail === q || pUniqueId === q || `#${pId}` === q || pId === q || pName === q;
                        } else {
                          return pEmail.includes(q) || pUniqueId.includes(q) || `#${pId}`.includes(q) || pId.includes(q) || pName.includes(q);
                        }
                      }
                      return true;
                    })
                    .map((p) => (
                      <tr key={p.id || p.user_id}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <UserAvatar user={{ name: p.user_name || p.user_email }} size={28} />
                            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "13.5px" }}>
                              {p.user_name || "Authorized User"}
                            </span>
                          </div>
                        </td>

                        <td style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>
                          {p.user_email}
                        </td>

                        <td>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 700,
                              fontFamily: "var(--font-mono)",
                              padding: "2px 6px",
                              background: "rgba(124, 92, 219, 0.08)",
                              color: "var(--brand-primary, #7C5CDB)",
                              borderRadius: "6px"
                            }}
                          >
                            {p.unique_id || `TV-USR-00${p.user_id}`}
                          </span>
                        </td>

                        <td>
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 700,
                              padding: "3px 9px",
                              borderRadius: "9999px",
                              textTransform: "uppercase",
                              background: p.permission === "edit" ? "rgba(16, 185, 129, 0.12)" : "rgba(15, 23, 42, 0.08)",
                              color: p.permission === "edit" ? "#059669" : "#0f172a"
                            }}
                          >
                            {p.permission === "edit" ? "Can Edit" : "Can Read"}
                          </span>
                        </td>

                        <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {formatDate(p.created_at)}
                        </td>

                        <td style={{ textAlign: "right" }}>
                          <button
                            onClick={() => setRevokeUser(p)}
                            className="btn btn-danger btn-sm"
                            style={{ borderRadius: "9999px", padding: "5px 12px", fontSize: "12px", gap: "5px" }}
                            title="Revoke Permission"
                          >
                            <Trash2 size={12} />
                            <span>Revoke</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            /* Mobile Collaborator Cards (< 768px) - Eliminates horizontal overflow */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {permissions
                .filter((p) => {
                  if (collabPermFilter !== "all" && p.permission !== collabPermFilter) return false;
                  if (collabSearch.trim()) {
                    const q = collabSearch.trim().toLowerCase();
                    const pName = (p.user_name || "").toLowerCase();
                    const pEmail = (p.user_email || "").toLowerCase();
                    const pUniqueId = (p.unique_id || `TV-USR-00${p.user_id}`).toLowerCase();
                    const pId = String(p.user_id || "");
                    if (collabExact) {
                      return pEmail === q || pUniqueId === q || `#${pId}` === q || pId === q || pName === q;
                    } else {
                      return pEmail.includes(q) || pUniqueId.includes(q) || `#${pId}`.includes(q) || pId.includes(q) || pName.includes(q);
                    }
                  }
                  return true;
                })
                .map((p) => (
                  <div
                    key={p.id || p.user_id}
                    style={{
                      padding: "14px 16px",
                      background: "rgba(248, 250, 252, 0.9)",
                      border: "1px solid rgba(226, 232, 240, 0.9)",
                      borderRadius: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "10px"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, flex: "1 1 180px" }}>
                        <UserAvatar user={{ name: p.user_name || p.user_email }} size={32} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "13.5px", display: "block", wordBreak: "break-word" }}>
                              {p.user_name || "Authorized User"}
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                                padding: "1px 5px",
                                background: "rgba(124, 92, 219, 0.08)",
                                color: "var(--brand-primary, #7C5CDB)",
                                borderRadius: "4px"
                              }}
                            >
                              {p.unique_id || `TV-USR-00${p.user_id}`}
                            </span>
                          </div>
                          <span style={{ color: "var(--text-secondary)", fontFamily: "var(--font-mono)", fontSize: "12px", wordBreak: "break-all", display: "block" }}>
                            {p.user_email}
                          </span>
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          padding: "3px 9px",
                          borderRadius: "9999px",
                          textTransform: "uppercase",
                          background: p.permission === "edit" ? "rgba(16, 185, 129, 0.12)" : "rgba(15, 23, 42, 0.08)",
                          color: p.permission === "edit" ? "#059669" : "#0f172a",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {p.permission === "edit" ? "Can Edit" : "Can Read"}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "10px", borderTop: "1px solid rgba(226, 232, 240, 0.8)", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        Granted: {formatDate(p.created_at)}
                      </span>
                      <button
                        onClick={() => setRevokeUser(p)}
                        className="btn btn-danger btn-sm"
                        style={{ borderRadius: "9999px", padding: "6px 14px", fontSize: "12px", gap: "5px" }}
                        title="Revoke Permission"
                      >
                        <Trash2 size={13} />
                        <span>Revoke</span>
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Revocation Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(revokeUser)}
        onClose={() => setRevokeUser(null)}
        onConfirm={handleRevokeConfirm}
        title="Revoke Document Permission"
        message={`Are you sure you want to revoke access for ${revokeUser?.user_email || "this user"}? They will immediately lose decryption and access capabilities.`}
        confirmText="Revoke Access"
        confirmVariant="danger"
        loading={revokeLoading}
      />
    </div>
  );
}

export default PermissionsPage;
