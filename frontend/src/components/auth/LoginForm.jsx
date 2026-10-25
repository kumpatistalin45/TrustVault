import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RoleSelector } from "./RoleSelector";
import { InlineAlert } from "./InlineAlert";
import { EmailLinkLoginForm } from "./EmailLinkLoginForm";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck
} from "lucide-react";

export function LoginForm({ onRoleChange, initialRole = "viewer", className = "" }) {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [selectedRole, setSelectedRole] = useState(initialRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Admin form state (Username & Password)
  const [adminUsername, setAdminUsername] = useState(initialRole === "admin" ? "Admin@trustvault.com" : "");
  const [adminPassword, setAdminPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [adminErrors, setAdminErrors] = useState({});

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError("");
    setAdminErrors({});

    if (role === "admin") {
      if (!adminUsername || adminUsername.includes("trustvault.internal") || adminUsername === "Alex Vance (Admin)") {
        setAdminUsername("Admin@trustvault.com");
      }
    }

    if (onRoleChange) {
      onRoleChange(role);
    }
  };

  // -------------------------------------------------------------------------
  // ADMIN AUTHENTICATION HANDLER (Username & Password ONLY)
  // Strictly no OTP login, no Forgot Password UI for Admin
  // -------------------------------------------------------------------------
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setError("");
    const errs = {};

    const trimmedUsername = adminUsername.trim();
    if (!trimmedUsername) {
      errs.username = "Administrator username or corporate email is required.";
    }

    if (!adminPassword) {
      errs.password = "Administrator password is required.";
    }

    if (Object.keys(errs).length > 0) {
      setAdminErrors(errs);
      return;
    }

    setLoading(true);
    try {
      await login({
        username: trimmedUsername,
        password: adminPassword,
        role: "admin"
      });

      if (showToast) {
        showToast("Administrator credentials verified. Access granted.", "success");
      }
      navigate("/admin");
    } catch (err) {
      setError(err?.message || "Invalid administrator credentials. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`login-form-container ${className}`} style={{ width: "100%" }}>
      {/* 1. Three-Role Selection Buttons at top */}
      <RoleSelector
        selectedRole={selectedRole}
        onSelectRole={handleRoleSelect}
        disabled={loading}
      />

      {/* Red Inline Error for Server / Authentication Errors */}
      {error && <InlineAlert type="error" message={error} onClose={() => setError("")} />}

      {/* =========================================================================
          ADMIN AUTHENTICATION FLOW (Username and Password ONLY)
          Strictly NO Forgot Password link, button, or workflow!
         ========================================================================= */}
      {selectedRole === "admin" && (
        <form onSubmit={handleAdminLogin} noValidate>
          <div
            style={{
              padding: "10px 14px",
              background: "rgba(220, 38, 38, 0.04)",
              border: "1px solid rgba(220, 38, 38, 0.15)",
              borderRadius: "14px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <ShieldCheck size={18} color="#dc2626" />
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              <strong>Admin Security Portal:</strong> Password authentication required. Password reset and public registration are strictly disabled for administrators.
            </div>
          </div>

          {/* Username Field */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="admin-username"
              style={{
                display: "block",
                fontSize: "12.5px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-secondary)",
                marginBottom: "8px"
              }}
            >
              Administrator Username / Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="admin-username"
                type="text"
                value={adminUsername}
                onChange={(e) => {
                  setAdminUsername(e.target.value);
                  if (adminErrors.username) setAdminErrors((p) => ({ ...p, username: "" }));
                  if (error) setError("");
                }}
                disabled={loading}
                placeholder="e.g. Admin@trustvault.com"
                autoComplete="username"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.9)",
                  border: adminErrors.username ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
            </div>
            {adminErrors.username && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {adminErrors.username}
              </span>
            )}
          </div>

          {/* Password Field with Show/Hide toggle */}
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="admin-password"
              style={{
                display: "block",
                fontSize: "12.5px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-secondary)",
                marginBottom: "8px"
              }}
            >
              Administrator Password
            </label>
            <div style={{ position: "relative" }}>
              <Lock
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                value={adminPassword}
                onChange={(e) => {
                  setAdminPassword(e.target.value);
                  if (adminErrors.password) setAdminErrors((p) => ({ ...p, password: "" }));
                  if (error) setError("");
                }}
                disabled={loading}
                placeholder="••••••••••••••••"
                autoComplete="current-password"
                style={{
                  width: "100%",
                  padding: "12px 44px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.9)",
                  border: adminErrors.password ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none"
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {adminErrors.password && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {adminErrors.password}
              </span>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            aria-label="Sign In as Administrator"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "16px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            <span>{loading ? "Authenticating Administrator..." : "Sign In as Administrator"}</span>
            <ArrowRight size={15} />
          </button>
        </form>
      )}

      {/* =========================================================================
          OWNER / VIEWER: Firebase Passwordless Email Link Authentication
          Replaces the previous MSG91 6-digit OTP flow.
         ========================================================================= */}
      {selectedRole !== "admin" && (
        <EmailLinkLoginForm
          selectedRole={selectedRole}
          onRoleChange={onRoleChange}
        />
      )}

      {/* Enterprise Provisioning Notice */}
      <div style={{ textAlign: "center", marginTop: "24px", padding: "0 8px" }}>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0, lineHeight: 1.4 }}>
          TrustVault is an enterprise-managed vault. Accounts are provisioned exclusively by organization administrators.
        </p>
      </div>
    </div>
  );
}

export default LoginForm;
