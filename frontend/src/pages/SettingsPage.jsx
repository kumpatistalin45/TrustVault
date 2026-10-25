import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { UserAvatar } from "../components/common/UserAvatar";
import { ToggleSwitch } from "../components/common/ToggleSwitch";
import {
  Sun,
  Moon,
  Laptop,
  Bell,
  Eye,
  Sliders,
  Shield,
  Monitor,
  CheckCircle2,
  FileText,
  LogOut,
  ExternalLink,
  ChevronRight,
  Info
} from "lucide-react";

export function SettingsPage() {
  const { user, role, logout } = useAuth();
  const { theme, setTheme, density, setDensity, textSize, setTextSize } = useTheme();
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Notification toggles
  const [downloadAlerts, setDownloadAlerts] = useState(() => {
    return localStorage.getItem("tv_notif_download") !== "false";
  });
  const [sessionAlerts, setSessionAlerts] = useState(() => {
    return localStorage.getItem("tv_notif_session") !== "false";
  });
  const [emailSecurityAlerts, setEmailSecurityAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  const handleDownloadAlertsToggle = () => {
    const next = !downloadAlerts;
    setDownloadAlerts(next);
    localStorage.setItem("tv_notif_download", next ? "true" : "false");
    showToast(`In-app download confirmations ${next ? "enabled" : "muted"}.`, "info");
  };

  const handleSessionAlertsToggle = () => {
    const next = !sessionAlerts;
    setSessionAlerts(next);
    localStorage.setItem("tv_notif_session", next ? "true" : "false");
    showToast(`Session security alerts ${next ? "enabled" : "muted"}.`, "info");
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (_e) {
      navigate("/");
    }
  };

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "28px" }} className="animate-fade-in">
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
          Preferences & Settings
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
          Customize visual appearance, notifications, accessibility, and session security.
        </p>
      </div>

      {/* 1. APPEARANCE SETTINGS */}
      <div className="card-white" style={{ padding: "32px", borderRadius: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a"
            }}
          >
            <Sun size={16} />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Theme & Appearance
          </h2>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Select your preferred interface theme. Preference is saved and applied across all views.
        </p>

        {/* 3 Theme Options */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "14px", marginBottom: "20px" }}>
          {/* Light Theme */}
          <button
            type="button"
            onClick={() => setTheme("light")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "18px",
              borderRadius: "20px",
              border: theme === "light" ? "2px solid #0f172a" : "1px solid rgba(226, 232, 240, 0.8)",
              background: theme === "light" ? "rgba(99, 102, 241, 0.06)" : "rgba(255, 255, 255, 0.7)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
              boxShadow: theme === "light" ? "0 4px 16px rgba(15, 23, 42, 0.08)" : "none"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "12px" }}>
              <Sun size={20} color="#f59e0b" />
              {theme === "light" && <CheckCircle2 size={16} color="#059669" />}
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
              Light Theme
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Soft pale-blue and lavender gradient
            </span>
          </button>

          {/* Dark Theme */}
          <button
            type="button"
            onClick={() => setTheme("dark")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "18px",
              borderRadius: "20px",
              border: theme === "dark" ? "2px solid #38bdf8" : "1px solid rgba(226, 232, 240, 0.8)",
              background: theme === "dark" ? "rgba(14, 165, 233, 0.08)" : "rgba(255, 255, 255, 0.7)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
              boxShadow: theme === "dark" ? "0 4px 16px rgba(14, 165, 233, 0.15)" : "none"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "12px" }}>
              <Moon size={20} color="#38bdf8" />
              {theme === "dark" && <CheckCircle2 size={16} color="#38bdf8" />}
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
              Dark Theme
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              High-contrast deep slate atmosphere
            </span>
          </button>

          {/* System Theme */}
          <button
            type="button"
            onClick={() => setTheme("system")}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              padding: "18px",
              borderRadius: "20px",
              border: theme === "system" ? "2px solid #6366f1" : "1px solid rgba(226, 232, 240, 0.8)",
              background: theme === "system" ? "rgba(99, 102, 241, 0.08)" : "rgba(255, 255, 255, 0.7)",
              cursor: "pointer",
              textAlign: "left",
              transition: "all 0.15s ease",
              boxShadow: theme === "system" ? "0 4px 16px rgba(99, 102, 241, 0.12)" : "none"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "12px" }}>
              <Laptop size={20} color="#6366f1" />
              {theme === "system" && <CheckCircle2 size={16} color="#6366f1" />}
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>
              System Theme
            </span>
            <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
              Sync with your device OS preference
            </span>
          </button>
        </div>
      </div>

      {/* 2. ACCESSIBILITY SETTINGS */}
      <div className="card-white" style={{ padding: "32px", borderRadius: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a"
            }}
          >
            <Eye size={16} />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Accessibility & Layout
          </h2>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Tailor density, contrast, and font sizing to your ergonomics.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* Density Control */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                Layout Spacing Density
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Adjust table row height and card margins.
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setDensity("comfortable")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  background: density === "comfortable" ? "#0f172a" : "rgba(15, 23, 42, 0.06)",
                  color: density === "comfortable" ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer"
                }}
              >
                Comfortable
              </button>
              <button
                type="button"
                onClick={() => setDensity("compact")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  background: density === "compact" ? "#0f172a" : "rgba(15, 23, 42, 0.06)",
                  color: density === "compact" ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer"
                }}
              >
                Compact
              </button>
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.7)" }} />

          {/* Text Size Control */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", display: "block" }}>
                Text Size
              </span>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Scales body and headings for enhanced readability.
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                type="button"
                onClick={() => setTextSize("normal")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  background: textSize === "normal" ? "#0f172a" : "rgba(15, 23, 42, 0.06)",
                  color: textSize === "normal" ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer"
                }}
              >
                Standard (14.5px)
              </button>
              <button
                type="button"
                onClick={() => setTextSize("large")}
                style={{
                  padding: "6px 14px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  border: "none",
                  background: textSize === "large" ? "#0f172a" : "rgba(15, 23, 42, 0.06)",
                  color: textSize === "large" ? "#ffffff" : "var(--text-secondary)",
                  cursor: "pointer"
                }}
              >
                Large (16px)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. NOTIFICATIONS SETTINGS */}
      <div className="card-white" style={{ padding: "32px", borderRadius: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a"
            }}
          >
            <Bell size={16} />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Notification Preferences
          </h2>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Configure real-time alerts. Settings marked with [Active Client Setting] take effect immediately.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {/* In-app download confirmations */}
          <div
            className="setting-toggle-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              width: "100%"
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  In-App Download Confirmations
                </span>
                <span style={{ fontSize: "10px", background: "rgba(16, 185, 129, 0.12)", color: "#059669", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                  Active Client Setting
                </span>
              </div>
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Receive pop-up toast notices when file decryption completes.
              </span>
            </div>
            <div style={{ flexShrink: 0, paddingTop: "2px" }}>
              <ToggleSwitch
                checked={downloadAlerts}
                onChange={handleDownloadAlertsToggle}
                ariaLabel="Toggle in-app download confirmations"
              />
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.7)" }} />

          {/* In-app session timeout alerts */}
          <div
            className="setting-toggle-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              width: "100%"
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Session Expiry & Revocation Notices
                </span>
                <span style={{ fontSize: "10px", background: "rgba(16, 185, 129, 0.12)", color: "#059669", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                  Active Client Setting
                </span>
              </div>
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Show banner notice upon reaching the 5-minute temporary document access limit.
              </span>
            </div>
            <div style={{ flexShrink: 0, paddingTop: "2px" }}>
              <ToggleSwitch
                checked={sessionAlerts}
                onChange={handleSessionAlertsToggle}
                ariaLabel="Toggle session alerts"
              />
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.7)" }} />

          {/* Email Security Alerts (Backend Dependent) */}
          <div
            className="setting-toggle-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              width: "100%"
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                  New Device Login Email Alerts
                </span>
                <span style={{ fontSize: "10px", background: "rgba(15, 23, 42, 0.08)", color: "var(--text-muted)", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                  Requires Phase 2 Email Service
                </span>
              </div>
              <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.4 }}>
                Sends automated email alert when your account logs in from a new IP or device.
              </span>
            </div>
            <div style={{ flexShrink: 0, paddingTop: "2px" }}>
              <ToggleSwitch
                checked={emailSecurityAlerts}
                onChange={() => {
                  setEmailSecurityAlerts(!emailSecurityAlerts);
                  showToast("Email notifications preference noted. Service requires Phase 2 SMTP backend.", "info");
                }}
                ariaLabel="Toggle email security alerts"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4. ACCOUNT & SESSION DETAILS */}
      <div className="card-white" style={{ padding: "32px", borderRadius: "28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "10px",
              background: "rgba(15, 23, 42, 0.06)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0f172a"
            }}
          >
            <Shield size={16} />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700, margin: 0, color: "var(--text-primary)" }}>
            Account & Session Details
          </h2>
        </div>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
          Authenticated identity and active session parameters.
        </p>

        {/* User details card */}
        <div
          className="frosted-panel"
          style={{
            padding: "16px 20px",
            borderRadius: "20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
            marginBottom: "20px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <UserAvatar user={user} size={46} />
            <div>
              <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                {user?.name || "Verified Employee"}
              </span>
              <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                {user?.email || "employee@trustvault.internal"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "9999px",
                background: "rgba(15, 23, 42, 0.08)",
                color: "var(--text-primary)",
                textTransform: "uppercase"
              }}
            >
              Role: {role.toUpperCase()}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontWeight: 700,
                padding: "3px 10px",
                borderRadius: "9999px",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#059669"
              }}
            >
              Active Session
            </span>
          </div>
        </div>

        {/* Legal & Policy Links */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
            gap: "12px",
            marginBottom: "24px"
          }}
        >
          <Link
            to="/privacy"
            style={{
              padding: "12px 16px",
              borderRadius: "16px",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <FileText size={15} color="var(--text-muted)" />
              <span>Privacy Policy</span>
            </div>
            <ChevronRight size={14} color="var(--text-muted)" />
          </Link>

          <Link
            to="/terms"
            style={{
              padding: "12px 16px",
              borderRadius: "16px",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(226, 232, 240, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "var(--text-primary)",
              textDecoration: "none",
              fontSize: "13px",
              fontWeight: 600
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Shield size={15} color="var(--text-muted)" />
              <span>Terms & Conditions</span>
            </div>
            <ChevronRight size={14} color="var(--text-muted)" />
          </Link>
        </div>

        {/* Logout action */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={handleLogout}
            className="btn-secondary"
            style={{
              padding: "10px 22px",
              borderRadius: "9999px",
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <LogOut size={14} />
            <span>Sign Out from TrustVault</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
