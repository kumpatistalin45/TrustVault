import React, { useState } from "react";
import { X, Bell, ShieldAlert, UserCheck, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "../common/Button";

export function NotificationDrawer({ isOpen, onClose }) {
  const [notifications, setNotifications] = useState([
    {
      id: "notif-1",
      type: "access",
      title: "Document Access Granted",
      message: "You have been granted read access to 'Q4 Financial Statement.pdf'",
      time: "10 minutes ago",
      read: false,
      icon: <FileText size={16} color="#2563eb" />
    },
    {
      id: "notif-2",
      type: "security",
      title: "New Session Initialized",
      message: "Successful authentication from browser on local workspace",
      time: "1 hour ago",
      read: false,
      icon: <ShieldAlert size={16} color="#4f46e5" />
    },
    {
      id: "notif-3",
      type: "sharing",
      title: "Permission Update",
      message: "Access to 'Security Architecture Review' was updated to Edit",
      time: "3 hours ago",
      read: true,
      icon: <UserCheck size={16} color="#059669" />
    }
  ]);

  const [filter, setFilter] = useState("all");

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const filtered = notifications.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter === "security") return n.type === "security";
    return true;
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.4)",
          backdropFilter: "blur(2px)",
          zIndex: 60
        }}
      />

      {/* Slide-over Panel */}
      <div
        className="animate-fade-in"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "100%",
          maxWidth: "400px",
          height: "100vh",
          background: "rgba(255, 255, 255, 0.78)",
          backdropFilter: "blur(28px) saturate(180%)",
          WebkitBackdropFilter: "blur(28px) saturate(180%)",
          boxShadow: "-12px 0 35px rgba(15, 23, 42, 0.12)",
          borderLeft: "1px solid rgba(255, 255, 255, 0.85)",
          zIndex: 70,
          display: "flex",
          flexDirection: "column"
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Notifications Panel"
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: "22px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "#eef2ff",
                color: "#4f46e5",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <Bell size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                Notifications
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {unreadCount > 0 ? `${unreadCount} unread security notices` : "All caught up"}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "6px",
              borderRadius: "6px"
            }}
            aria-label="Close notifications panel"
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Pills */}
        <div
          style={{
            padding: "12px 24px",
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              onClick={() => setFilter("all")}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: filter === "all" ? "#4f46e5" : "transparent",
                background: filter === "all" ? "#eef2ff" : "transparent",
                color: filter === "all" ? "#4f46e5" : "var(--text-secondary)",
                cursor: "pointer"
              }}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "4px 10px",
                borderRadius: "20px",
                border: "1px solid",
                borderColor: filter === "unread" ? "#4f46e5" : "transparent",
                background: filter === "unread" ? "#eef2ff" : "transparent",
                color: filter === "unread" ? "#4f46e5" : "var(--text-secondary)",
                cursor: "pointer"
              }}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              style={{
                fontSize: "12px",
                color: "#4f46e5",
                background: "transparent",
                border: "none",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Notification List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 16px", color: "var(--text-muted)" }}>
              <CheckCircle2 size={36} color="#10b981" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                No notifications to display
              </p>
              <span style={{ fontSize: "12px" }}>
                You are all caught up on workspace and security activity.
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {filtered.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: "14px",
                    borderRadius: "10px",
                    background: item.read ? "#ffffff" : "#f8fafc",
                    border: "1px solid",
                    borderColor: item.read ? "var(--border-subtle)" : "#cbd5e1",
                    display: "flex",
                    gap: "12px",
                    transition: "all 0.15s ease",
                    position: "relative"
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "8px",
                      background: "#f1f5f9",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}
                  >
                    {item.icon}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: item.read ? 600 : 700,
                          color: "var(--text-primary)"
                        }}
                      >
                        {item.title}
                      </span>
                      {!item.read && (
                        <span
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: "#4f46e5"
                          }}
                        />
                      )}
                    </div>
                    <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.4, margin: "0 0 6px 0" }}>
                      {item.message}
                    </p>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--bg-primary)",
            textAlign: "center"
          }}
        >
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
            Security events are logged immutably in PostgreSQL audit trails.
          </span>
        </div>
      </div>
    </>
  );
}

export default NotificationDrawer;
