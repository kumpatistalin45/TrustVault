import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { formatDate } from "../services/mockData";
import { apiUpdateProfile, apiChangePassword, isMockActive } from "../services/api";
import {
  User,
  LogOut,
  Mail,
  Shield,
  Calendar,
  Lock,
  Camera,
  Bell,
  Check,
  AlertCircle,
  Edit2,
  X,
  Phone
} from "lucide-react";
import { UserAvatar } from "../components/common/UserAvatar";
import { ToggleSwitch } from "../components/common/ToggleSwitch";
import { SecurityNotificationCard } from "../components/session/SecurityNotificationCard";

export function ProfilePage() {
  const { user, role, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (_e) {
      navigate("/");
    }
  };

  const userRole = (role || user?.role || "viewer").toLowerCase();
  const defaultPhone =
    user?.phone ||
    (userRole === "admin"
      ? "+1 (555) 017-3390"
      : userRole === "owner"
      ? "+1 (555) 018-9412"
      : "+1 (555) 019-2834");

  // Local Profile State for editing and previewing
  const [profileData, setProfileData] = useState(() => ({
    name:
      user?.name ||
      (userRole === "admin"
        ? "Alex Vance"
        : userRole === "owner"
        ? "Jane Doe"
        : "Bob Smith"),
    email:
      user?.email ||
      (userRole === "admin"
        ? "admin@trustvault.internal"
        : userRole === "owner"
        ? "jane.owner@trustvault.internal"
        : "bob.viewer@trustvault.internal"),
    phone: defaultPhone,
    avatar: user?.avatar_url || user?.avatar || null
  }));

  // Edit Profile UI Mode State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({ ...profileData });
  const [avatarPreview, setAvatarPreview] = useState(profileData.avatar);
  const fileInputRef = useRef(null);

  const [emailAlerts, setEmailAlerts] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  // Change password modal / state
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const displayRole =
    userRole === "admin"
      ? "Administrator"
      : userRole === "owner"
      ? "Document Owner"
      : "Viewer";

  const roleBadgeStyle =
    userRole === "admin"
      ? { background: "rgba(244, 63, 94, 0.12)", color: "#e11d48", border: "1px solid rgba(244, 63, 94, 0.25)" }
      : userRole === "owner"
      ? { background: "rgba(124, 58, 237, 0.12)", color: "#7c3aed", border: "1px solid rgba(124, 58, 237, 0.25)" }
      : { background: "rgba(14, 165, 233, 0.12)", color: "#0284c7", border: "1px solid rgba(14, 165, 233, 0.25)" };

  // Open Edit Profile form
  const handleOpenEditProfile = () => {
    setEditForm({
      name: profileData.name,
      email: profileData.email,
      phone: profileData.phone,
      avatar: profileData.avatar
    });
    setAvatarPreview(profileData.avatar);
    setIsEditingProfile(true);
  };

  // Cancel Edit Profile form
  const handleCancelEditProfile = () => {
    setEditForm({ ...profileData });
    setAvatarPreview(profileData.avatar);
    setIsEditingProfile(false);
  };

  // Handle Photo File Upload Preview
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Selected photo exceeds 5MB limit.", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result;
      setAvatarPreview(dataUrl);
      setEditForm((prev) => ({ ...prev, avatar: dataUrl }));
      showToast("Photo preview loaded. Click Save Changes to apply in local UI.", "info");
    };
    reader.readAsDataURL(file);
  };

  // Remove Photo Preview
  const handleRemovePhoto = () => {
    setAvatarPreview(null);
    setEditForm((prev) => ({ ...prev, avatar: null }));
    if (fileInputRef.current) fileInputRef.current.value = "";
    showToast("Photo removed. Initials avatar will be displayed.", "info");
  };

  // Save Edit Profile Changes (real backend API with optimistic UI update)
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim()) {
      showToast("Full Name cannot be blank.", "error");
      return;
    }
    if (!editForm.email.trim() || !editForm.email.includes("@")) {
      showToast("Please enter a valid Gmail / Email address.", "error");
      return;
    }

    // Update UI state synchronously
    setProfileData({
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim() || defaultPhone,
      avatar: editForm.avatar
    });
    setIsEditingProfile(false);
    showToast("Profile details updated for this local UI session.", "success");

    // Sync with backend when not in mock/test mode
    if (!isMockActive()) {
      try {
        await apiUpdateProfile({
          name: editForm.name.trim(),
          mobile: editForm.phone.trim() || defaultPhone,
          avatar_url: editForm.avatar
        });
      } catch (err) {
        showToast(err.message || "Failed to update profile on backend.", "error");
      }
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg(null);

    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "New passwords do not match." });
      return;
    }

    if (newPassword.length < 12) {
      setPasswordMsg({ type: "error", text: "New password must contain at least 12 characters." });
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await apiChangePassword({ currentPassword, newPassword });
      setPasswordMsg({
        type: "success",
        text: res.message || "Password updated successfully."
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password updated successfully.", "success");
    } catch (err) {
      setPasswordMsg({
        type: "error",
        text: err.message || "Failed to change password. Verify your current password."
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
      {/* Header */}
      <div>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "30px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 6px 0",
            letterSpacing: "-0.02em"
          }}
        >
          My Profile
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14.5px", margin: 0 }}>
          Manage your verified employee credentials, security settings, and notification preferences.
        </p>
      </div>

      {/* Main Profile Identity Card */}
      <div className="card-white" style={{ padding: "36px", borderRadius: "32px" }}>
        {!isEditingProfile ? (
          /* ================= VIEW PROFILE MODE ================= */
          <>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                {/* Avatar with Camera Update Trigger */}
                <div style={{ position: "relative" }}>
                  <UserAvatar
                    user={{ name: profileData.name, email: profileData.email, avatar: profileData.avatar }}
                    size={76}
                  />

                  <button
                    type="button"
                    onClick={handleOpenEditProfile}
                    style={{
                      position: "absolute",
                      bottom: "0",
                      right: "0",
                      width: "26px",
                      height: "26px",
                      borderRadius: "50%",
                      background: "#ffffff",
                      border: "1px solid rgba(226, 232, 240, 0.9)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#0f172a",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.1)"
                    }}
                    title="Change profile photo"
                    aria-label="Change profile photo"
                  >
                    <Camera size={13} />
                  </button>
                </div>

                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px", flexWrap: "wrap" }}>
                    <h2
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "22px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        margin: 0
                      }}
                    >
                      {profileData.name}
                    </h2>
                    <span
                      style={{
                        ...roleBadgeStyle,
                        padding: "3px 12px",
                        borderRadius: "9999px",
                        fontSize: "11px",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em"
                      }}
                    >
                      {displayRole}
                    </span>
                  </div>
                  <span style={{ fontSize: "14px", color: "var(--text-muted)" }}>
                    {profileData.email}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Edit Profile & Sign Out */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleOpenEditProfile}
                  className="btn btn-secondary"
                  style={{
                    borderRadius: "9999px",
                    padding: "10px 20px",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "7px"
                  }}
                  id="edit-profile-btn"
                >
                  <Edit2 size={14} />
                  <span>Edit Profile</span>
                </button>

                <button
                  onClick={handleLogout}
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    color: "#dc2626",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    padding: "10px 20px",
                    borderRadius: "9999px",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.15s ease"
                  }}
                >
                  <LogOut size={15} />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.8)", margin: "28px 0" }} />

            {/* Essential Information Grid (4 Cards) */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                gap: "16px"
              }}
            >
              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "16px 18px",
                  borderRadius: "20px",
                  border: "1px solid rgba(226, 232, 240, 0.8)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Mail size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Gmail / Email
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                  {profileData.email}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "16px 18px",
                  borderRadius: "20px",
                  border: "1px solid rgba(226, 232, 240, 0.8)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Phone size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Mobile Number
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  {profileData.phone}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "16px 18px",
                  borderRadius: "20px",
                  border: "1px solid rgba(226, 232, 240, 0.8)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Shield size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Account Role
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>
                  {displayRole}
                </div>
              </div>

              <div
                style={{
                  background: "rgba(248, 250, 252, 0.8)",
                  padding: "16px 18px",
                  borderRadius: "20px",
                  border: "1px solid rgba(226, 232, 240, 0.8)"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <Calendar size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Registered Since
                  </span>
                </div>
                <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                  {formatDate(user?.created_at || new Date().toISOString())}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ================= EDIT PROFILE MODE ================= */
          <div className="animate-fade-in">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span
                    style={{
                      ...roleBadgeStyle,
                      padding: "2px 10px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.04em"
                    }}
                  >
                    {displayRole}
                  </span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>• Edit Profile UI</span>
                </div>
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "22px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    margin: 0
                  }}
                >
                  Edit Profile Information
                </h2>
                <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
                  Update your display name, contact phone number, email address, and profile photo for this session.
                </p>
              </div>

              <button
                type="button"
                onClick={handleCancelEditProfile}
                className="btn-circle"
                style={{ width: "34px", height: "34px" }}
                title="Cancel and close edit mode"
                aria-label="Cancel editing"
              >
                <X size={15} />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {/* Avatar Preview & Change Photo Row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "20px",
                  padding: "16px 20px",
                  background: "rgba(248, 250, 252, 0.8)",
                  borderRadius: "20px",
                  border: "1px solid rgba(226, 232, 240, 0.9)",
                  flexWrap: "wrap"
                }}
              >
                {/* Avatar Preview */}
                <div style={{ position: "relative" }}>
                  <UserAvatar
                    user={{ name: editForm.name, email: editForm.email, avatar: avatarPreview }}
                    size={76}
                  />
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px" }}>
                    Profile Avatar Preview
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="btn btn-secondary btn-sm"
                      style={{ borderRadius: "9999px", gap: "6px", fontSize: "12.5px", padding: "6px 14px" }}
                    >
                      <Camera size={13} />
                      <span>Change Photo</span>
                    </button>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/webp"
                      onChange={handlePhotoChange}
                      style={{ display: "none" }}
                    />

                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="btn btn-ghost btn-sm"
                        style={{ borderRadius: "9999px", color: "#dc2626", fontSize: "12px", padding: "6px 12px" }}
                      >
                        Remove Photo
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: "11.5px", color: "var(--text-muted)", display: "block" }}>
                    Supported formats: PNG, JPG, or WebP (max 5MB). Live preview updates immediately.
                  </span>
                </div>
              </div>

              {/* Editable Form Fields Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                  gap: "18px"
                }}
              >
                {/* Full Name */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Full Name
                  </label>
                  <div style={{ position: "relative" }}>
                    <User
                      size={16}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="text"
                      required
                      value={editForm.name}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Jane Doe"
                      className="form-control"
                      style={{ paddingLeft: "38px", borderRadius: "14px", fontSize: "13.5px" }}
                    />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Your display name across the TrustVault portal.
                  </span>
                </div>

                {/* Mobile Number */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Mobile Number
                  </label>
                  <div style={{ position: "relative" }}>
                    <Phone
                      size={16}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="e.g. +1 (555) 019-2834"
                      className="form-control"
                      style={{ paddingLeft: "38px", borderRadius: "14px", fontSize: "13.5px" }}
                    />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Primary telephone for SMS security alerts and recovery.
                  </span>
                </div>

                {/* Gmail / Email Address */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Gmail / Email Address
                  </label>
                  <div style={{ position: "relative" }}>
                    <Mail
                      size={16}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="email"
                      required
                      value={editForm.email}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      placeholder="e.g. employee@trustvault.internal"
                      className="form-control"
                      style={{ paddingLeft: "38px", borderRadius: "14px", fontSize: "13.5px" }}
                    />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Authorized email used for discretionary access grants and login.
                  </span>
                </div>

                {/* Account Role (Read-only) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: "13px", fontWeight: 600 }}>
                    Account Role
                  </label>
                  <div style={{ position: "relative" }}>
                    <Shield
                      size={16}
                      color="var(--text-muted)"
                      style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
                    />
                    <input
                      type="text"
                      value={`${displayRole} (Policy Locked)`}
                      disabled
                      className="form-control"
                      style={{
                        paddingLeft: "38px",
                        borderRadius: "14px",
                        fontSize: "13.5px",
                        background: "rgba(241, 245, 249, 0.7)",
                        color: "var(--text-muted)",
                        cursor: "not-allowed"
                      }}
                    />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    Role boundaries are enforced by administrator security policy.
                  </span>
                </div>
              </div>

              {/* Local State Notice */}
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  background: "rgba(248, 250, 252, 0.75)",
                  padding: "10px 14px",
                  borderRadius: "14px",
                  border: "1px solid rgba(226, 232, 240, 0.8)",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }}
              >
                <AlertCircle size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                <span>
                  Note: Profile updates are saved to your active session.
                </span>
              </div>

              {/* Form Actions: Save Changes and Cancel */}
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={handleCancelEditProfile}
                  className="btn btn-secondary"
                  style={{ borderRadius: "9999px", padding: "9px 22px", fontSize: "13px" }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    borderRadius: "9999px",
                    padding: "9px 24px",
                    fontSize: "13px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <Check size={14} />
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* Account Preferences & Security Section */}
      <div className="card-white" style={{ padding: "32px", borderRadius: "32px" }}>
        <h3
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "18px",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: "0 0 16px 0"
          }}
        >
          Account Preferences
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Notification Preference Toggle */}
          <div
            className="setting-toggle-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              padding: "14px 18px",
              background: "rgba(248, 250, 252, 0.8)",
              borderRadius: "20px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ paddingTop: "2px", flexShrink: 0 }}>
                <Bell size={18} color="var(--text-secondary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "13.5px", color: "var(--text-primary)", marginBottom: "3px" }}>
                  Document Assignment Notifications
                </strong>
                <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Receive an email notification when Admin assigns a document to your account.
                </span>
              </div>
            </div>
            <div style={{ flexShrink: 0, paddingTop: "2px" }}>
              <ToggleSwitch
                checked={emailAlerts}
                onChange={() => setEmailAlerts((prev) => !prev)}
                ariaLabel="Toggle document assignment notifications"
              />
            </div>
          </div>

          {/* Security Alert Preference Toggle */}
          <div
            className="setting-toggle-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              padding: "14px 18px",
              background: "rgba(248, 250, 252, 0.8)",
              borderRadius: "20px",
              border: "1px solid rgba(226, 232, 240, 0.8)"
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ paddingTop: "2px", flexShrink: 0 }}>
                <Shield size={18} color="var(--text-secondary)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ display: "block", fontSize: "13.5px", color: "var(--text-primary)", marginBottom: "3px" }}>
                  Security Verification Alerts
                </strong>
                <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Receive instant notifications when OTP verification keys are issued.
                </span>
              </div>
            </div>
            <div style={{ flexShrink: 0, paddingTop: "2px" }}>
              <ToggleSwitch
                checked={securityAlerts}
                onChange={() => setSecurityAlerts((prev) => !prev)}
                ariaLabel="Toggle security alerts"
              />
            </div>
          </div>
        </div>

        <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.8)", margin: "24px 0" }} />

        {/* Change Password Dropdown / Section */}
        <div>
          <button
            type="button"
            onClick={() => setShowPasswordSection((prev) => !prev)}
            className="btn btn-secondary"
            style={{ borderRadius: "9999px", gap: "8px", fontSize: "13px" }}
          >
            <Lock size={14} />
            <span>{showPasswordSection ? "Cancel Password Change" : "Change Account Password"}</span>
          </button>

          {showPasswordSection && (
            <form onSubmit={handlePasswordSubmit} style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "14px", maxWidth: "480px" }}>
              {passwordMsg && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "14px",
                    background: passwordMsg.type === "error" ? "#fef2f2" : "#f0fdf4",
                    border: passwordMsg.type === "error" ? "1px solid #fecaca" : "1px solid #bbf7d0",
                    color: passwordMsg.type === "error" ? "#991b1b" : "#166534",
                    fontSize: "12.5px",
                    lineHeight: 1.5
                  }}
                >
                  {passwordMsg.text}
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontSize: "12.5px", fontWeight: 600 }}>Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="form-control"
                  placeholder="Enter current password"
                  style={{ borderRadius: "12px", fontSize: "13px" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: "12.5px", fontWeight: 600 }}>New Password (12+ characters)</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="form-control"
                  placeholder="Enter new 12+ character password"
                  style={{ borderRadius: "12px", fontSize: "13px" }}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: "12.5px", fontWeight: 600 }}>Confirm New Password</label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="form-control"
                  placeholder="Re-enter new password"
                  style={{ borderRadius: "12px", fontSize: "13px" }}
                />
              </div>

              <button
                type="submit"
                disabled={passwordLoading}
                className="btn btn-primary"
                style={{ borderRadius: "9999px", width: "fit-content", padding: "10px 24px", fontSize: "13px" }}
              >
                {passwordLoading ? "Updating..." : "Update Password"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Single-Device Policy & Security Session Management */}
      <SecurityNotificationCard role={role} />
    </div>
  );
}

export default ProfilePage;
