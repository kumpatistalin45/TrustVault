import React from "react";
import { Shield, KeyRound, Eye, CheckCircle2 } from "lucide-react";

export const ROLES = [
  {
    id: "admin",
    label: "Admin",
    title: "System Admin",
    description: "Policy & system oversight",
    icon: Shield,
    color: "#C6537D"
  },
  {
    id: "owner",
    label: "Owner",
    title: "Document Owner",
    description: "Upload & share controls",
    icon: KeyRound,
    color: "#7C5CDB"
  },
  {
    id: "viewer",
    label: "Viewer",
    title: "Document Viewer",
    description: "Authorized access only",
    icon: Eye,
    color: "#2563EB"
  }
];

export function RoleSelector({
  selectedRole = "viewer",
  onSelectRole,
  disabled = false,
  isRegistration = false,
  className = ""
}) {
  const displayedRoles = isRegistration
    ? ROLES.filter((r) => r.id !== "admin")
    : ROLES;

  return (
    <div className={`role-selector-container ${className}`} style={{ width: "100%", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
        <label
          style={{
            fontSize: "12.5px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--text-secondary)",
            fontFamily: "var(--font-body)"
          }}
        >
          Select Access Role
        </label>
      </div>

      <div
        role="radiogroup"
        aria-label="Select Access Role"
        className="role-selector-grid"
        style={isRegistration ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : undefined}
      >
        {displayedRoles.map((role) => {
          const isSelected = selectedRole === role.id;
          const IconComponent = role.icon;

          return (
            <button
              key={role.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelectRole && onSelectRole(role.id)}
              className="role-selector-btn"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                justifyContent: "space-between",
                padding: "14px 12px",
                minHeight: "84px",
                borderRadius: "16px",
                boxSizing: "border-box",
                width: "100%",
                border: isSelected
                  ? "2px solid #0f172a"
                  : "1px solid rgba(226, 232, 240, 0.9)",
                background: isSelected
                  ? "#0f172a"
                  : "rgba(255, 255, 255, 0.75)",
                color: isSelected ? "#ffffff" : "var(--text-primary)",
                boxShadow: isSelected
                  ? "0 8px 20px rgba(15, 23, 42, 0.16)"
                  : "0 2px 6px rgba(15, 23, 42, 0.03)",
                cursor: disabled ? "not-allowed" : "pointer",
                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
                textAlign: "left",
                outline: "none"
              }}
              onMouseEnter={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.95)";
                  e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.6)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected && !disabled) {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.75)";
                  e.currentTarget.style.borderColor = "rgba(226, 232, 240, 0.9)";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
              onFocus={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99, 102, 241, 0.25)";
                }
              }}
              onBlur={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(15, 23, 42, 0.03)";
                }
              }}
            >
              {/* Header row: Icon & Status indicator */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "8px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "10px",
                    background: isSelected
                      ? "rgba(255, 255, 255, 0.15)"
                      : "rgba(15, 23, 42, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: isSelected ? "#ffffff" : "#0f172a"
                  }}
                >
                  <IconComponent size={15} />
                </div>

                {isSelected ? (
                  <CheckCircle2 size={15} color="#38bdf8" />
                ) : (
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "rgba(148, 163, 184, 0.4)"
                    }}
                  />
                )}
              </div>

              {/* Text content */}
              <div>
                <span
                  style={{
                    display: "block",
                    fontFamily: "var(--font-heading)",
                    fontSize: "13.5px",
                    fontWeight: 700,
                    letterSpacing: "-0.01em",
                    lineHeight: 1.2,
                    color: isSelected ? "#ffffff" : "var(--text-primary)"
                  }}
                >
                  {role.label}
                </span>
                <span
                  className="role-selector-desc"
                  style={{
                    display: "block",
                    fontSize: "10.5px",
                    color: isSelected ? "rgba(255, 255, 255, 0.7)" : "var(--text-muted)",
                    marginTop: "2px",
                    lineHeight: 1.2
                  }}
                >
                  {role.description}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {isRegistration && selectedRole === "admin" && (
        <div
          role="alert"
          style={{
            marginTop: "12px",
            padding: "10px 14px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "12px",
            fontSize: "12px",
            lineHeight: 1.4,
            color: "#b91c1c",
            display: "flex",
            alignItems: "flex-start",
            gap: "8px"
          }}
        >
          <Shield size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <strong style={{ display: "block", fontWeight: 700 }}>Admin Provisioning Restricted</strong>
            Admin accounts cannot be created through public registration. Public visitors cannot create Admin accounts.
            Please contact your organization administrator for enterprise provisioning or an authorized invite code.
          </div>
        </div>
      )}
    </div>
  );
}

export default RoleSelector;
