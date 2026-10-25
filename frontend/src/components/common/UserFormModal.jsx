import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { Input } from "./Input";
import { Select } from "./Select";
import { Button } from "./Button";
import { InlineAlert } from "../auth/InlineAlert";
import { User, Mail, Phone, Building, ShieldCheck, CheckCircle2 } from "lucide-react";

export function UserFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData = null,
  role = "owner", // "owner" | "viewer"
  loading = false
}) {
  const isEdit = Boolean(initialData?.id);
  const title = isEdit
    ? `Edit ${role === "owner" ? "Owner" : "Viewer"} Profile`
    : `Add New ${role === "owner" ? "Document Owner" : "Authorized Viewer"}`;

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    mobile: "",
    department: "Corporate Security",
    status: "active",
    approval_state: "approved",
    access_state: "granted"
  });

  const [errors, setErrors] = useState({});
  const [generalError, setGeneralError] = useState("");

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        email: initialData.email || "",
        mobile: initialData.mobile || "",
        department: initialData.department || (role === "owner" ? "Corporate Security" : "Risk Management"),
        status: initialData.status || "active",
        approval_state: initialData.approval_state || "approved",
        access_state: initialData.access_state || "granted"
      });
    } else {
      setFormData({
        name: "",
        email: "",
        mobile: "",
        department: role === "owner" ? "Corporate Security" : "Risk Management",
        status: "active",
        approval_state: "approved",
        access_state: "granted"
      });
    }
    setErrors({});
    setGeneralError("");
  }, [initialData, role, isOpen]);

  const validate = () => {
    const errs = {};
    if (!formData.name.trim()) {
      errs.name = "Full name is required.";
    } else if (formData.name.trim().length < 2) {
      errs.name = "Name must be at least 2 characters.";
    }

    const emailTrim = formData.email.trim();
    if (!emailTrim) {
      errs.email = "Corporate email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) {
      errs.email = "Please enter a valid email address (e.g., user@company.com).";
    }

    if (formData.mobile && !/^[\d\s+\-().]{7,25}$/.test(formData.mobile.trim())) {
      errs.mobile = "Please enter a valid phone number.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGeneralError("");
    if (!validate()) return;

    try {
      await onSubmit(formData);
      onClose();
    } catch (err) {
      setGeneralError(err.message || "Failed to save record.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="560px">
      <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        {generalError && <InlineAlert type="error" message={generalError} onClose={() => setGeneralError("")} />}

        {/* Full Name */}
        <div>
          <label
            htmlFor="user-form-name"
            style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
          >
            Full Legal Name <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <User size={15} color="var(--text-muted)" style={{ position: "absolute", left: "14px", top: "14px" }} />
            <input
              id="user-form-name"
              type="text"
              value={formData.name}
              onChange={(e) => {
                setFormData((p) => ({ ...p, name: e.target.value }));
                if (errors.name) setErrors((p) => ({ ...p, name: "" }));
              }}
              placeholder="e.g. Jane Doe"
              style={{
                width: "100%",
                padding: "12px 14px 12px 38px",
                borderRadius: "14px",
                border: errors.name ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                background: "rgba(255, 255, 255, 0.9)",
                fontSize: "13.5px",
                color: "var(--text-primary)",
                outline: "none"
              }}
            />
          </div>
          {errors.name && <span style={{ color: "#ef4444", fontSize: "11.5px", marginTop: "4px", display: "block" }}>{errors.name}</span>}
        </div>

        {/* Email Address */}
        <div>
          <label
            htmlFor="user-form-email"
            style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
          >
            Corporate Email Address <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <div style={{ position: "relative" }}>
            <Mail size={15} color="var(--text-muted)" style={{ position: "absolute", left: "14px", top: "14px" }} />
            <input
              id="user-form-email"
              type="email"
              value={formData.email}
              onChange={(e) => {
                setFormData((p) => ({ ...p, email: e.target.value }));
                if (errors.email) setErrors((p) => ({ ...p, email: "" }));
              }}
              placeholder="e.g. employee@company.com"
              style={{
                width: "100%",
                padding: "12px 14px 12px 38px",
                borderRadius: "14px",
                border: errors.email ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                background: "rgba(255, 255, 255, 0.9)",
                fontSize: "13.5px",
                color: "var(--text-primary)",
                outline: "none"
              }}
            />
          </div>
          {errors.email && <span style={{ color: "#ef4444", fontSize: "11.5px", marginTop: "4px", display: "block" }}>{errors.email}</span>}
        </div>

        {/* Mobile & Department Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label
              htmlFor="user-form-mobile"
              style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
            >
              Mobile Contact
            </label>
            <div style={{ position: "relative" }}>
              <Phone size={15} color="var(--text-muted)" style={{ position: "absolute", left: "14px", top: "14px" }} />
              <input
                id="user-form-mobile"
                type="text"
                value={formData.mobile}
                onChange={(e) => setFormData((p) => ({ ...p, mobile: e.target.value }))}
                placeholder="+1 (555) 000-0000"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 38px",
                  borderRadius: "14px",
                  border: errors.mobile ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.9)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="user-form-department"
              style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
            >
              Department / Unit
            </label>
            <div style={{ position: "relative" }}>
              <Building size={15} color="var(--text-muted)" style={{ position: "absolute", left: "14px", top: "14px" }} />
              <input
                id="user-form-department"
                type="text"
                value={formData.department}
                onChange={(e) => setFormData((p) => ({ ...p, department: e.target.value }))}
                placeholder="e.g. Compliance"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 38px",
                  borderRadius: "14px",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  background: "rgba(255, 255, 255, 0.9)",
                  fontSize: "13.5px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>
          </div>
        </div>

        {/* Status & Approval / Access State Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          <div>
            <label
              htmlFor="user-form-status"
              style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
            >
              Account Status
            </label>
            <select
              id="user-form-status"
              value={formData.status}
              onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value }))}
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid rgba(203, 213, 225, 0.8)",
                background: "rgba(255, 255, 255, 0.9)",
                fontSize: "13.5px",
                color: "var(--text-primary)",
                outline: "none"
              }}
            >
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
              {role === "viewer" && <option value="suspended">Suspended</option>}
            </select>
          </div>

          <div>
            <label
              htmlFor="user-form-state"
              style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "6px" }}
            >
              {role === "owner" ? "Approval State" : "Access State"}
            </label>
            <select
              id="user-form-state"
              value={role === "owner" ? formData.approval_state : formData.access_state}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  [role === "owner" ? "approval_state" : "access_state"]: e.target.value
                }))
              }
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid rgba(203, 213, 225, 0.8)",
                background: "rgba(255, 255, 255, 0.9)",
                fontSize: "13.5px",
                color: "var(--text-primary)",
                outline: "none"
              }}
            >
              {role === "owner" ? (
                <>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </>
              ) : (
                <>
                  <option value="granted">Granted</option>
                  <option value="restricted">Restricted</option>
                  <option value="revoked">Revoked</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading} icon={<CheckCircle2 size={15} />}>
            {isEdit ? "Save Changes" : `Create ${role === "owner" ? "Owner" : "Viewer"}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default UserFormModal;
