/**
 * TrustVault - Isolated Mock Data Service
 * Used only when mock mode is enabled or as an offline fallback.
 * Keeps mock data strictly separate from real API responses.
 */

export const MOCK_USERS = {
  admin: {
    id: 1,
    name: "Alex Vance (Admin)",
    email: "admin@trustvault.internal",
    role: "admin",
    created_at: "2026-10-15T09:00:00Z"
  },
  owner: {
    id: 2,
    name: "Jane Doe (Owner)",
    email: "jane.owner@trustvault.internal",
    role: "owner",
    created_at: "2026-10-16T10:30:00Z"
  },
  viewer: {
    id: 3,
    name: "Bob Smith (Viewer)",
    email: "bob.viewer@trustvault.internal",
    role: "viewer",
    created_at: "2026-10-17T11:15:00Z"
  }
};

export const MOCK_DOCUMENTS = [
  {
    id: 101,
    name: "Snovasys_Hiring_Challenge_Specs.pdf",
    category: "Engineering",
    mime_type: "application/pdf",
    size_bytes: 2457600,
    owner_id: 2,
    owner_name: "Jane Doe",
    owner_email: "jane.owner@trustvault.internal",
    access_level: "owner",
    timer_enabled: true,
    timer_duration_minutes: 5,
    auto_delete: true,
    created_at: "2026-10-18T14:20:00Z",
    updated_at: "2026-10-18T14:20:00Z"
  },
  {
    id: 102,
    name: "Security_Architecture_Threat_Model.pdf",
    category: "Security",
    mime_type: "application/pdf",
    size_bytes: 1843200,
    owner_id: 2,
    owner_name: "Jane Doe",
    owner_email: "jane.owner@trustvault.internal",
    access_level: "owner",
    timer_enabled: false,
    timer_duration_minutes: 10,
    auto_delete: true,
    created_at: "2026-10-18T15:00:00Z",
    updated_at: "2026-10-18T15:30:00Z"
  },
  {
    id: 103,
    name: "Q3_Financial_Audit_Report.xlsx",
    category: "Finance",
    mime_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size_bytes: 840500,
    owner_id: 1,
    owner_name: "Alex Vance",
    owner_email: "admin@trustvault.internal",
    access_level: "edit",
    created_at: "2026-10-17T08:45:00Z",
    updated_at: "2026-10-17T08:45:00Z"
  },
  {
    id: 104,
    name: "Employee_Confidentiality_Agreement.pdf",
    category: "Legal",
    mime_type: "application/pdf",
    size_bytes: 524288,
    owner_id: 1,
    owner_name: "Alex Vance",
    owner_email: "admin@trustvault.internal",
    access_level: "read",
    created_at: "2026-10-16T16:10:00Z",
    updated_at: "2026-10-16T16:10:00Z"
  }
];

export const MOCK_PERMISSIONS = {
  101: [
    {
      id: 1,
      document_id: 101,
      user_id: 3,
      user_name: "Bob Smith",
      user_email: "bob.viewer@trustvault.internal",
      permission: "read",
      created_at: "2026-10-18T14:25:00Z"
    },
    {
      id: 2,
      document_id: 101,
      user_id: 1,
      user_name: "Alex Vance",
      user_email: "admin@trustvault.internal",
      permission: "edit",
      created_at: "2026-10-18T14:30:00Z"
    }
  ],
  102: [
    {
      id: 3,
      document_id: 102,
      user_id: 3,
      user_name: "Bob Smith",
      user_email: "bob.viewer@trustvault.internal",
      permission: "read",
      created_at: "2026-10-18T15:10:00Z"
    }
  ]
};

export const MOCK_AUDIT_LOGS = [
  {
    id: 901,
    actor_id: 2,
    actor_name: "Jane Doe",
    actor_email: "jane.owner@trustvault.internal",
    action: "document_upload",
    document_id: 102,
    outcome: "success",
    details: { filename: "Security_Architecture_Threat_Model.pdf", encryption: "AES-256-GCM" },
    created_at: "2026-10-18T15:00:00Z"
  },
  {
    id: 902,
    actor_id: 2,
    actor_name: "Jane Doe",
    actor_email: "jane.owner@trustvault.internal",
    action: "permission_grant",
    document_id: 102,
    target_user_id: 3,
    outcome: "success",
    details: { permission: "read" },
    created_at: "2026-10-18T15:10:00Z"
  },
  {
    id: 903,
    actor_id: 3,
    actor_name: "Bob Smith",
    actor_email: "bob.viewer@trustvault.internal",
    action: "document_download",
    document_id: 102,
    outcome: "success",
    details: { encryption: "AES-256-GCM" },
    created_at: "2026-10-18T15:15:00Z"
  },
  {
    id: 904,
    actor_id: 3,
    actor_name: "Bob Smith",
    actor_email: "bob.viewer@trustvault.internal",
    action: "document_update",
    document_id: 102,
    outcome: "denied",
    details: { reason: "Document missing or edit access denied" },
    created_at: "2026-10-18T15:18:00Z"
  },
  {
    id: 905,
    actor_id: 1,
    actor_name: "Alex Vance",
    actor_email: "admin@trustvault.internal",
    action: "admin_audit_logs_read",
    outcome: "success",
    details: { limit: 100 },
    created_at: "2026-10-18T15:20:00Z"
  }
];

export function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(isoString) {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  } catch {
    return "—";
  }
}

export function getRoleBadgeVariant(role) {
  const r = (role || "").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "owner") return "owner";
  if (r === "viewer") return "viewer";
  return "default";
}

export const MOCK_USERS_LIST = [
  {
    id: 1,
    name: "Alex Vance",
    email: "admin@trustvault.internal",
    role: "admin",
    status: "active",
    created_at: "2026-10-15T09:00:00Z",
    last_login: "2026-10-21T07:12:00Z",
    documents_count: 2
  },
  {
    id: 2,
    name: "Jane Doe",
    email: "jane.owner@trustvault.internal",
    role: "owner",
    status: "active",
    created_at: "2026-10-16T10:30:00Z",
    last_login: "2026-10-21T06:45:00Z",
    documents_count: 2
  },
  {
    id: 3,
    name: "Bob Smith",
    email: "bob.viewer@trustvault.internal",
    role: "viewer",
    status: "active",
    created_at: "2026-10-17T11:15:00Z",
    last_login: "2026-10-20T18:20:00Z",
    documents_count: 0
  },
  {
    id: 4,
    name: "Sarah Connor",
    email: "sarah.connor@trustvault.internal",
    role: "owner",
    status: "active",
    created_at: "2026-10-18T13:40:00Z",
    last_login: "2026-10-21T04:10:00Z",
    documents_count: 4
  },
  {
    id: 5,
    name: "David Kim",
    email: "david.kim@trustvault.internal",
    role: "viewer",
    status: "inactive",
    created_at: "2026-10-19T08:15:00Z",
    last_login: "2026-10-19T09:00:00Z",
    documents_count: 0
  },
  {
    id: 6,
    name: "Elena Rostova",
    email: "elena.r@trustvault.internal",
    role: "viewer",
    status: "suspended",
    created_at: "2026-10-14T12:00:00Z",
    last_login: "2026-10-18T15:30:00Z",
    documents_count: 0
  }
];

export const MOCK_ADMIN_STATS = {
  totalAccounts: 6,
  roleCounts: {
    admin: 1,
    owner: 2,
    viewer: 3
  },
  totalDocuments: 4,
  recentUploadsCount: 2,
  securityEventsCount: 5,
  accessDeniedCount: 1,
  pendingComplaintsCount: 2,
  recentPermissionChangesCount: 3
};

export const MOCK_ADMIN_COMPLAINTS = [
  {
    id: 1,
    referenceId: "TV-CMP-84920",
    category: "Document Access",
    subject: "Permission denied for Q4 Financial Statements",
    description: "I received notification that the document was assigned by my Admin, but upon clicking Unlock & Download, the system reported an authorization error.",
    submitterName: "Bob Smith",
    submitterEmail: "bob.viewer@trustvault.internal",
    priority: "High",
    status: "In Review",
    relatedDocumentName: "Q4 Financial Statements 2026",
    attachmentName: "error_screenshot.png",
    createdAt: "2026-10-19T14:32:00Z",
    timeline: [
      {
        id: 1,
        author: "System Audit",
        message: "Complaint registered with reference TV-CMP-84920.",
        timestamp: "2026-10-19T14:32:00Z",
        type: "system"
      },
      {
        id: 2,
        author: "Enterprise Support Lead",
        message: "Investigating permission synchronization on Vault Node 04. Admin has been notified to re-verify document assignment.",
        timestamp: "2026-10-19T16:15:00Z",
        type: "agent"
      }
    ]
  },
  {
    id: 2,
    referenceId: "TV-CMP-73105",
    category: "Login/OTP",
    subject: "Delayed email OTP delivery during peak hours",
    description: "The 6-digit verification code took approximately 4 minutes to arrive in corporate inbox.",
    submitterName: "Elena Rostova",
    submitterEmail: "elena.r@trustvault.internal",
    priority: "Medium",
    status: "Resolved",
    relatedDocumentName: "N/A",
    attachmentName: null,
    createdAt: "2026-10-15T09:12:00Z",
    timeline: [
      {
        id: 1,
        author: "System Audit",
        message: "Complaint registered with reference TV-CMP-73105.",
        timestamp: "2026-10-15T09:12:00Z",
        type: "system"
      },
      {
        id: 2,
        author: "Alex Vance (Admin)",
        message: "SMTP gateway throttling policy adjusted. Delivery latency reduced to under 3 seconds.",
        timestamp: "2026-10-15T11:45:00Z",
        type: "admin"
      }
    ]
  },
  {
    id: 3,
    referenceId: "TV-CMP-92014",
    category: "Policy & Compliance",
    subject: "Request for retention policy audit certificate",
    description: "Need verification of automated purge schedule for expired financial audits.",
    submitterName: "Jane Doe",
    submitterEmail: "jane.owner@trustvault.internal",
    priority: "Low",
    status: "Pending",
    relatedDocumentName: "Q3_Financial_Audit_Report.xlsx",
    attachmentName: null,
    createdAt: "2026-10-20T11:20:00Z",
    timeline: [
      {
        id: 1,
        author: "System Audit",
        message: "Complaint registered with reference TV-CMP-92014.",
        timestamp: "2026-10-20T11:20:00Z",
        type: "system"
      }
    ]
  }
];

export const MOCK_PERMISSION_HISTORY = [
  {
    id: 1,
    documentId: 101,
    documentName: "Snovasys_Hiring_Challenge_Specs.pdf",
    targetUserEmail: "bob.viewer@trustvault.internal",
    targetUserName: "Bob Smith",
    permission: "read",
    action: "grant",
    changedByEmail: "jane.owner@trustvault.internal",
    changedByName: "Jane Doe",
    timestamp: "2026-10-18T14:25:00Z",
    reason: "Standard developer onboarding grant"
  },
  {
    id: 2,
    documentId: 101,
    documentName: "Snovasys_Hiring_Challenge_Specs.pdf",
    targetUserEmail: "admin@trustvault.internal",
    targetUserName: "Alex Vance",
    permission: "edit",
    action: "grant",
    changedByEmail: "jane.owner@trustvault.internal",
    changedByName: "Jane Doe",
    timestamp: "2026-10-18T14:30:00Z",
    reason: "Administrative policy review assignment"
  },
  {
    id: 3,
    documentId: 102,
    documentName: "Security_Architecture_Threat_Model.pdf",
    targetUserEmail: "bob.viewer@trustvault.internal",
    targetUserName: "Bob Smith",
    permission: "read",
    action: "grant",
    changedByEmail: "jane.owner@trustvault.internal",
    changedByName: "Jane Doe",
    timestamp: "2026-10-18T15:10:00Z",
    reason: "Security audit peer review"
  }
];


