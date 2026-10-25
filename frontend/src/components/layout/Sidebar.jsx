import React from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  FileText,
  Clock,
  User,
  LogOut,
  ShieldAlert,
  Shield,
  HelpCircle,
  Settings,
  X,
  LayoutDashboard,
  UploadCloud,
  Activity,
  Users,
  UserCheck,
  KeyRound,
  Inbox
} from "lucide-react";
import { UserAvatar } from "../common/UserAvatar";

export function Sidebar({ isOpen, onClose }) {
  const { user, role, isOwner, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch (_err) {
      navigate("/");
    }
  };

  const navItems = isAdmin
    ? [
        {
          to: "/admin",
          label: "Overview",
          icon: <LayoutDashboard size={17} />,
          isActive: location.pathname === "/admin" || location.pathname === "/admin/dashboard"
        },
        {
          to: "/admin/owners",
          label: "Owner Master Data",
          icon: <UserCheck size={17} />,
          isActive: location.pathname === "/admin/owners"
        },
        {
          to: "/admin/users",
          label: "User Management",
          icon: <Users size={17} />,
          isActive: location.pathname === "/admin/users"
        },
        {
          to: "/admin/documents",
          label: "Document Oversight",
          icon: <FileText size={17} />,
          isActive: location.pathname === "/admin/documents"
        },
        {
          to: "/admin/permissions",
          label: "Permissions Oversight",
          icon: <KeyRound size={17} />,
          isActive: location.pathname === "/admin/permissions"
        },
        {
          to: "/admin/keys",
          label: "Secret Keys",
          icon: <Shield size={17} />,
          isActive: location.pathname === "/admin/keys"
        },
        {
          to: "/admin/audit",
          label: "Security Audit Logs",
          icon: <ShieldAlert size={17} />,
          isActive: location.pathname === "/admin/audit"
        },
        {
          to: "/admin/complaints",
          label: "Complaint Inbox",
          icon: <Inbox size={17} />,
          isActive: location.pathname === "/admin/complaints"
        },
        {
          to: "/help",
          label: "Help & Support",
          icon: <HelpCircle size={17} />,
          isActive: location.pathname === "/help" || location.pathname === "/support"
        },
        {
          to: "/settings",
          label: "Settings",
          icon: <Settings size={17} />,
          isActive: location.pathname === "/settings"
        },
        {
          to: "/profile",
          label: "My Profile",
          icon: <User size={17} />,
          isActive: location.pathname === "/profile"
        }
      ]
    : isOwner
    ? [
        {
          to: "/dashboard",
          label: "Dashboard",
          icon: <LayoutDashboard size={17} />,
          isActive: location.pathname === "/dashboard" || location.pathname === "/"
        },
        {
          to: "/documents",
          label: "My Documents",
          icon: <FileText size={17} />,
          isActive: location.pathname === "/documents" || (location.pathname.startsWith("/documents/") && location.pathname !== "/documents/upload" && !location.pathname.includes("/permissions"))
        },
        {
          to: "/permissions",
          label: "Manage Permissions",
          icon: <KeyRound size={17} />,
          isActive: location.pathname === "/permissions" || location.pathname.includes("/permissions")
        },
        {
          to: "/documents/upload",
          label: "Upload Document",
          icon: <UploadCloud size={17} />,
          isActive: location.pathname === "/documents/upload"
        },
        {
          to: "/viewers",
          label: "Manage Viewers",
          icon: <Users size={17} />,
          isActive: location.pathname === "/viewers" || location.pathname === "/owner/viewers"
        },
        {
          to: "/activity",
          label: "Document Activity",
          icon: <Activity size={17} />,
          isActive: location.pathname === "/activity"
        },
        {
          to: "/help",
          label: "Help & Support",
          icon: <HelpCircle size={17} />,
          isActive: location.pathname === "/help" || location.pathname === "/support"
        },
        {
          to: "/settings",
          label: "Settings",
          icon: <Settings size={17} />,
          isActive: location.pathname === "/settings"
        },
        {
          to: "/profile",
          label: "My Profile",
          icon: <User size={17} />,
          isActive: location.pathname === "/profile"
        }
      ]
    : [
        {
          to: "/viewer/dashboard",
          label: "Dashboard",
          icon: <LayoutDashboard size={17} />,
          isActive: location.pathname === "/viewer/dashboard" || location.pathname === "/"
        },
        {
          to: "/documents",
          label: "My Documents",
          icon: <FileText size={17} />,
          isActive: location.pathname === "/documents" || (location.pathname.startsWith("/documents/") && location.pathname !== "/documents/upload")
        },
        {
          to: "/history",
          label: "Download History",
          icon: <Clock size={17} />,
          isActive: location.pathname === "/history" || location.pathname === "/download-history"
        },
        {
          to: "/help",
          label: "Help & Support",
          icon: <HelpCircle size={17} />,
          isActive: location.pathname === "/help" || location.pathname === "/support"
        },
        {
          to: "/settings",
          label: "Settings",
          icon: <Settings size={17} />,
          isActive: location.pathname === "/settings"
        },
        {
          to: "/profile",
          label: "My Profile",
          icon: <User size={17} />,
          isActive: location.pathname === "/profile"
        }
      ];

  const displayRole = role === "admin" ? "Admin" : isOwner ? "Document Owner" : "Viewer";
  const portalSubtitle = role === "admin" ? "Admin Console" : isOwner ? "Owner Vault" : "Download Portal";

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 45
          }}
        />
      )}

      {/* Compact Frosted Glass Atmospheric Sidebar */}
      <aside
        style={{
          width: "240px",
          background: "rgba(255, 255, 255, 0.45)",
          backdropFilter: "blur(28px) saturate(190%)",
          WebkitBackdropFilter: "blur(28px) saturate(190%)",
          borderRight: "1px solid rgba(255, 255, 255, 0.65)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          flexShrink: 0,
          position: "sticky",
          top: 0,
          height: "100vh",
          overflowY: "auto",
          zIndex: 50,
          transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
        className={isOpen ? "sidebar-mobile-open" : "sidebar-desktop"}
      >
        <div>
          {/* Brand Header */}
          <div
            style={{
              padding: "24px 20px 20px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                className="sidebar-brand-icon"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "var(--brand-primary, #0f172a)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.15)"
                }}
              >
                <Shield size={18} />
              </div>
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.02em",
                    display: "block"
                  }}
                >
                  TrustVault
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase"
                  }}
                >
                  {portalSubtitle}
                </span>
              </div>
            </div>

            {/* Mobile Close Button */}
            {isOpen && (
              <button
                onClick={onClose}
                className="btn-circle"
                style={{ width: "32px", height: "32px" }}
                aria-label="Close menu"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Navigation Section */}
          <nav style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "6px" }}>
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "4px 12px 8px 12px",
                display: "block"
              }}
            >
              Navigation
            </span>

            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={`sidebar-nav-item ${item.isActive ? "active" : ""}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  borderRadius: "9999px",
                  fontSize: "13.5px",
                  fontWeight: item.isActive ? 700 : 500,
                  textDecoration: "none",
                  transition: "all 0.16s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ display: "flex" }}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      background: "rgba(15, 23, 42, 0.08)",
                      color: "#0f172a",
                      padding: "2px 8px",
                      borderRadius: "9999px"
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User Identity Pill & Logout */}
        <div style={{ padding: "16px 14px 20px 14px", borderTop: "1px solid rgba(255, 255, 255, 0.65)" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "rgba(255, 255, 255, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.9)",
              borderRadius: "20px",
              padding: "10px 12px",
              boxShadow: "0 2px 8px rgba(15, 23, 42, 0.03)",
              marginBottom: "10px"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
              <UserAvatar user={user} size={32} />

              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {user?.name || "Employee"}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: "10.5px",
                    color: "var(--text-muted)"
                  }}
                >
                  {displayRole}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: "12px",
              fontSize: "11px",
              color: "var(--text-muted)",
              marginBottom: "12px"
            }}
          >
            <NavLink to="/privacy" onClick={onClose} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Privacy Policy
            </NavLink>
            <span>•</span>
            <NavLink to="/terms" onClick={onClose} style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              Terms
            </NavLink>
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              padding: "9px",
              borderRadius: "9999px",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              background: "rgba(239, 68, 68, 0.06)",
              color: "#dc2626",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s ease"
            }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
