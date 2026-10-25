import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  Menu,
  Search,
  User,
  LogOut,
  ChevronRight,
  Clock,
  Settings,
  HelpCircle,
  FileText,
  Shield,
  KeyRound
} from "lucide-react";
import { UserAvatar } from "../common/UserAvatar";

export function Header({ onToggleSidebar, isSidebarOpen }) {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const accountRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setIsAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (_e) {
      navigate("/");
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/?search=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate("/");
    }
  };

  // Determine page title & breadcrumbs
  const getPageInfo = () => {
    const path = location.pathname;
    if (path === "/viewer/dashboard") {
      return { title: "Viewer Dashboard", breadcrumb: "Portal" };
    }
    if (path === "/dashboard") {
      return { title: "Owner Dashboard", breadcrumb: "Vault" };
    }
    if (path === "/" || path === "/documents") {
      return { title: "My Documents", breadcrumb: "Portal" };
    }
    if (path === "/history" || path === "/download-history") {
      return { title: "Download History", breadcrumb: "Portal" };
    }
    if (path === "/permissions" || path.includes("/permissions")) {
      return { title: "Manage Permissions", breadcrumb: "Vault" };
    }
    if (path === "/profile") {
      return { title: "My Profile", breadcrumb: "Account" };
    }
    if (path === "/admin/audit") {
      return { title: "Audit Trail", breadcrumb: "Admin" };
    }
    if (path === "/access-denied") {
      return { title: "Access Denied", breadcrumb: "Security" };
    }
    return { title: "TrustVault", breadcrumb: "Portal" };
  };

  const { title, breadcrumb } = getPageInfo();
  const displayRole = role === "admin" ? "Admin" : "Employee";

  return (
    <header
      style={{
        background: "rgba(255, 255, 255, 0.45)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.65)",
        position: "sticky",
        top: 0,
        zIndex: 40,
        boxShadow: "0 4px 20px -5px rgba(15, 23, 42, 0.04)"
      }}
    >
      <div
        className="app-header-container"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 36px",
          maxWidth: "1440px",
          margin: "0 auto",
          width: "100%",
          boxSizing: "border-box",
          gap: "16px"
        }}
      >
        {/* Left: Mobile hamburger & Breadcrumbs */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0 }}>
          <button
            onClick={onToggleSidebar}
            className="btn-circle sidebar-toggle-btn"
            style={{
              width: "36px",
              height: "36px"
            }}
            aria-label="Toggle navigation drawer"
          >
            <Menu size={17} />
          </button>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              className="breadcrumb-crumb"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                color: "var(--text-muted)"
              }}
            >
              <span>TrustVault</span>
              <ChevronRight size={12} color="var(--text-light)" />
              <span>{breadcrumb}</span>
            </div>
            <h1
              className="header-page-title"
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: 0,
                lineHeight: 1.2
              }}
            >
              {title}
            </h1>
          </div>
        </div>

        {/* Center: Search Documents Input */}
        <form
          className="header-search-form"
          onSubmit={handleSearchSubmit}
          style={{
            flex: "1 1 320px",
            maxWidth: "420px",
            position: "relative"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              position: "relative"
            }}
          >
            <span
              style={{
                position: "absolute",
                left: "16px",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                pointerEvents: "none"
              }}
            >
              <Search size={15} />
            </span>
            <input
              type="text"
              placeholder="Search documents... (Press Enter)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "9px 18px 9px 40px",
                fontSize: "13px",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255, 255, 255, 0.8)",
                borderRadius: "9999px",
                color: "var(--text-primary)",
                outline: "none",
                transition: "all 0.18s ease",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)"
              }}
              onFocus={(e) => {
                e.target.style.background = "#ffffff";
                e.target.style.borderColor = "#0f172a";
                e.target.style.boxShadow = "0 0 0 3px rgba(15, 23, 42, 0.08)";
              }}
              onBlur={(e) => {
                e.target.style.background = "rgba(255, 255, 255, 0.65)";
                e.target.style.borderColor = "rgba(255, 255, 255, 0.8)";
                e.target.style.boxShadow = "0 2px 8px rgba(15, 23, 42, 0.03)";
              }}
            />
          </div>
        </form>

        {/* Right: Actions & User Menu */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>

          {/* Owner Quick Permissions Button */}
          {role === "owner" && (
            <Link
              to="/permissions"
              className="btn btn-primary header-manage-permissions-btn"
              style={{
                borderRadius: "9999px",
                padding: "6px 14px",
                fontSize: "12px",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
              title="Manage Discretionary Permissions"
            >
              <KeyRound size={13} />
              <span>Manage Permissions</span>
            </Link>
          )}

          {/* Account Profile Button */}
          <div style={{ position: "relative" }} ref={accountRef}>
            <button
              onClick={() => setIsAccountOpen(!isAccountOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "4px 10px 4px 4px",
                borderRadius: "9999px",
                border: "1px solid rgba(255, 255, 255, 0.8)",
                background: "rgba(255, 255, 255, 0.65)",
                backdropFilter: "blur(12px)",
                cursor: "pointer",
                boxShadow: "0 2px 8px rgba(15, 23, 42, 0.04)",
                transition: "all 0.16s ease",
                flexShrink: 0
              }}
              aria-label="User profile menu"
            >
              <UserAvatar user={user} size={28} />
              <span className="header-user-name" style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>
                {user?.name?.split(" ")[0] || "Employee"}
              </span>
            </button>

            {/* Account Dropdown */}
            {isAccountOpen && (
              <div
                className="animate-fade-in card-white header-account-dropdown"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  width: "250px",
                  minWidth: "230px",
                  maxWidth: "calc(100vw - 20px)",
                  padding: "8px",
                  borderRadius: "18px",
                  boxShadow: "0 16px 36px rgba(15, 23, 42, 0.14)",
                  zIndex: 100,
                  boxSizing: "border-box"
                }}
              >
                <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(226, 232, 240, 0.8)" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", display: "block" }}>
                    {user?.name || "Employee"}
                  </span>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                    {user?.email || "employee@trustvault.internal"}
                  </span>
                </div>

                <div style={{ padding: "4px 0" }}>
                  <Link
                    to="/profile"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <User size={14} />
                    <span>My Profile</span>
                  </Link>

                  {role === "owner" && (
                    <Link
                      to="/permissions"
                      onClick={() => setIsAccountOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "8px 12px",
                        borderRadius: "10px",
                        fontSize: "12.5px",
                        color: "var(--text-secondary)",
                        textDecoration: "none",
                        transition: "all 0.15s ease"
                      }}
                    >
                      <KeyRound size={14} />
                      <span>Manage Permissions</span>
                    </Link>
                  )}

                  <Link
                    to="/settings"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <Settings size={14} />
                    <span>Preferences & Settings</span>
                  </Link>

                  <Link
                    to="/help"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <HelpCircle size={14} />
                    <span>Help & Support</span>
                  </Link>

                  <Link
                    to="/history"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      fontSize: "12.5px",
                      color: "var(--text-secondary)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <Clock size={14} />
                    <span>Download History</span>
                  </Link>

                  <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)", margin: "4px 8px" }} />

                  <Link
                    to="/privacy"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 12px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <FileText size={13} />
                    <span>Privacy Policy</span>
                  </Link>

                  <Link
                    to="/terms"
                    onClick={() => setIsAccountOpen(false)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "7px 12px",
                      borderRadius: "10px",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      textDecoration: "none",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <Shield size={13} />
                    <span>Terms & Conditions</span>
                  </Link>

                  <div style={{ height: "1px", background: "rgba(226, 232, 240, 0.6)", margin: "4px 8px" }} />

                  <button
                    onClick={handleLogout}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      border: "none",
                      background: "transparent",
                      color: "#dc2626",
                      fontSize: "12.5px",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "all 0.15s ease"
                    }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
