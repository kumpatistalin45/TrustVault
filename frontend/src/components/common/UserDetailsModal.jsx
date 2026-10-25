import React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";
import { UserAvatar } from "./UserAvatar";
import { formatDate } from "../../services/mockData";
import {
  User,
  Mail,
  Phone,
  Building,
  Calendar,
  Clock,
  ShieldCheck,
  FileText,
  Eye,
  Edit2,
  Lock,
  Unlock
} from "lucide-react";

export function UserDetailsModal({
  isOpen,
  onClose,
  userItem,
  role = "owner", // "owner" | "viewer"
  onEdit,
  onToggleStatus
}) {
  if (!userItem) return null;

  const isOwner = role === "owner";
  const title = `${isOwner ? "Document Owner" : "Authorized Viewer"} Profile Details`;
  const isActive = userItem.status === "active";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="600px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* User Card Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "14px",
            padding: "16px 20px",
            background: "rgba(248, 250, 252, 0.9)",
            borderRadius: "18px",
            border: "1px solid rgba(226, 232, 240, 0.8)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <UserAvatar name={userItem.name} size="lg" />
            <div>
              <h3
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "17px",
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  margin: "0 0 4px 0"
                }}
              >
                {userItem.name}
              </h3>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <StatusBadge status={userItem.status} />
                <StatusBadge
                  status={isOwner ? userItem.approval_state : userItem.access_state}
                  type={isOwner ? "approval" : "access"}
                />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {onEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onEdit(userItem);
                }}
                icon={<Edit2 size={13} />}
              >
                Edit
              </Button>
            )}
            {onToggleStatus && (
              <Button
                size="sm"
                variant={isActive ? "outline" : "primary"}
                onClick={() => {
                  onClose();
                  onToggleStatus(userItem);
                }}
                icon={isActive ? <Lock size={13} /> : <Unlock size={13} />}
              >
                {isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
          </div>
        </div>

        {/* Detailed Metadata Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            padding: "16px",
            background: "#ffffff",
            borderRadius: "16px",
            border: "1px solid rgba(226, 232, 240, 0.8)"
          }}
        >
          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <Mail size={12} /> Corporate Email
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px", fontFamily: "var(--font-mono)" }}>
              {userItem.email}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <Phone size={12} /> Mobile Contact
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
              {userItem.mobile || "Not specified"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <Building size={12} /> Department
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
              {userItem.department || "Operations"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <Calendar size={12} /> Onboarding Date
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
              {formatDate(userItem.created_at)}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={12} /> Last Active Session
            </span>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
              {userItem.last_login ? formatDate(userItem.last_login) : "Never logged in"}
            </div>
          </div>

          <div>
            <span style={{ fontSize: "11.5px", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.04em", display: "flex", alignItems: "center", gap: "4px" }}>
              <FileText size={12} /> {isOwner ? "Managed Documents" : "Assigned Documents"}
            </span>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent-indigo)", marginTop: "4px" }}>
              {isOwner ? `${userItem.documents_count || 0} Documents` : `${(userItem.assigned_documents || []).length} Documents`}
            </div>
          </div>
        </div>

        {/* Assigned Documents Section for Viewers */}
        {!isOwner && (
          <div>
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "13.5px",
                fontWeight: 700,
                color: "var(--text-primary)",
                margin: "0 0 10px 0"
              }}
            >
              Assigned Confidential Documents ({(userItem.assigned_documents || []).length})
            </h4>

            {(!userItem.assigned_documents || userItem.assigned_documents.length === 0) ? (
              <div
                style={{
                  padding: "18px",
                  textAlign: "center",
                  background: "rgba(15, 23, 42, 0.02)",
                  borderRadius: "14px",
                  fontSize: "12.5px",
                  color: "var(--text-muted)"
                }}
              >
                No confidential documents currently assigned to this viewer.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {userItem.assigned_documents.map((doc, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      borderRadius: "12px",
                      background: "rgba(248, 250, 252, 0.8)",
                      border: "1px solid rgba(226, 232, 240, 0.8)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <FileText size={16} color="#0284c7" />
                      <div>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {doc.name}
                        </span>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginLeft: "8px" }}>
                          ({doc.category || "General"})
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: "11.5px", color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <Eye size={12} /> Preview Granted
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Close */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default UserDetailsModal;
