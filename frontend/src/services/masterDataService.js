import { request, handleJsonResponse, isMockActive } from "./api";

const STORAGE_KEYS = {
  OWNERS: "trustvault_master_owners",
  VIEWERS: "trustvault_master_viewers"
};

const INITIAL_OWNERS = [
  {
    id: 101,
    name: "Jane Doe",
    email: "jane.owner@trustvault.internal",
    mobile: "+1 (555) 234-5678",
    department: "Corporate Security",
    status: "active",
    approval_state: "approved",
    documents_count: 5,
    viewers_count: 8,
    created_at: "2026-10-16T10:30:00Z",
    last_login: "2026-10-24T18:45:00Z"
  },
  {
    id: 102,
    name: "Sarah Connor",
    email: "sarah.connor@trustvault.internal",
    mobile: "+1 (555) 345-6789",
    department: "Legal & Compliance",
    status: "active",
    approval_state: "approved",
    documents_count: 3,
    viewers_count: 4,
    created_at: "2026-10-18T09:15:00Z",
    last_login: "2026-10-23T14:20:00Z"
  },
  {
    id: 103,
    name: "Michael Chang",
    email: "m.chang@trustvault.internal",
    mobile: "+1 (555) 456-7890",
    department: "Finance & Accounting",
    status: "pending",
    approval_state: "pending",
    documents_count: 0,
    viewers_count: 0,
    created_at: "2026-10-22T11:00:00Z",
    last_login: null
  },
  {
    id: 104,
    name: "Elena Rostova",
    email: "elena.r@trustvault.internal",
    mobile: "+1 (555) 567-8901",
    department: "Executive Operations",
    status: "active",
    approval_state: "approved",
    documents_count: 8,
    viewers_count: 12,
    created_at: "2026-10-17T13:40:00Z",
    last_login: "2026-10-24T12:10:00Z"
  },
  {
    id: 105,
    name: "David Kim",
    email: "david.kim@trustvault.internal",
    mobile: "+1 (555) 678-9012",
    department: "Research & Development",
    status: "inactive",
    approval_state: "rejected",
    documents_count: 0,
    viewers_count: 0,
    created_at: "2026-10-19T16:25:00Z",
    last_login: null
  }
];

const INITIAL_VIEWERS = [
  {
    id: 201,
    owner_id: 101, // Jane Doe
    name: "Bob Smith",
    email: "bob.viewer@trustvault.internal",
    mobile: "+1 (555) 987-6543",
    department: "Risk Management",
    status: "active",
    access_state: "granted",
    assigned_documents: [
      { id: 101, name: "Snovasys_Hiring_Challenge_Specs.pdf", category: "Engineering" },
      { id: 102, name: "Security_Architecture_Threat_Model.pdf", category: "Security" }
    ],
    created_at: "2026-10-17T11:15:00Z",
    last_login: "2026-10-24T19:10:00Z"
  },
  {
    id: 202,
    owner_id: 101, // Jane Doe
    name: "Alice Johnson",
    email: "alice.j@trustvault.internal",
    mobile: "+1 (555) 876-5432",
    department: "Internal Audit",
    status: "active",
    access_state: "granted",
    assigned_documents: [
      { id: 102, name: "Security_Architecture_Threat_Model.pdf", category: "Security" }
    ],
    created_at: "2026-10-19T08:30:00Z",
    last_login: "2026-10-23T16:40:00Z"
  },
  {
    id: 203,
    owner_id: 101, // Jane Doe
    name: "Carlos Mendez",
    email: "carlos.m@trustvault.internal",
    mobile: "+1 (555) 765-4321",
    department: "Quality Assurance",
    status: "inactive",
    access_state: "restricted",
    assigned_documents: [],
    created_at: "2026-10-20T14:00:00Z",
    last_login: null
  },
  {
    id: 204,
    owner_id: 102, // Sarah Connor
    name: "Diana Prince",
    email: "diana.p@trustvault.internal",
    mobile: "+1 (555) 654-3210",
    department: "Regulatory Compliance",
    status: "active",
    access_state: "granted",
    assigned_documents: [
      { id: 104, name: "Employee_Confidentiality_Agreement.pdf", category: "Legal" }
    ],
    created_at: "2026-10-18T10:00:00Z",
    last_login: "2026-10-24T15:20:00Z"
  },
  {
    id: 205,
    owner_id: 101, // Jane Doe
    name: "Frank Castle",
    email: "frank.c@trustvault.internal",
    mobile: "+1 (555) 543-2109",
    department: "Facilities Security",
    status: "suspended",
    access_state: "revoked",
    assigned_documents: [],
    created_at: "2026-10-21T09:45:00Z",
    last_login: "2026-10-22T11:05:00Z"
  }
];

function getStored(key, fallback) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const data = window.localStorage.getItem(key);
      if (data) return JSON.parse(data);
      window.localStorage.setItem(key, JSON.stringify(fallback));
    }
  } catch (_e) {}
  return fallback;
}

function setStored(key, value) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (_e) {}
}

// -------------------------------------------------------------
// Owners API (Admin Scope)
// -------------------------------------------------------------

export function getOwners({
  search = "",
  status = "all",
  approvalState = "all",
  sortBy = "created_at",
  sortDir = "desc",
  page = 1,
  limit = 10
} = {}) {
  if (isMockActive()) {
    let list = [...getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS)];

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          o.email.toLowerCase().includes(q) ||
          (o.mobile && o.mobile.toLowerCase().includes(q)) ||
          (o.department && o.department.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (status !== "all") {
      list = list.filter((o) => o.status === status);
    }

    // Approval state filter
    if (approvalState !== "all") {
      list = list.filter((o) => o.approval_state === approvalState);
    }

    // Sorting
    list.sort((a, b) => {
      let valA = a[sortBy] ?? "";
      let valB = b[sortBy] ?? "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const total = list.length;
    const start = (page - 1) * limit;
    const paginated = list.slice(start, start + limit);

    return {
      owners: paginated,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit))
    };
  }

  return (async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status && status !== "all") params.set("status", status);
      if (page) params.set("page", String(page));
      if (limit) params.set("limit", String(limit));

      const res = await request(`/api/admin/owners?${params.toString()}`);
      const data = await handleJsonResponse(res);
      return {
        owners: data.owners || [],
        total: data.total || 0,
        page: data.page || 1,
        totalPages: data.totalPages || 1
      };
    } catch (err) {
      console.warn("Backend admin owners request failed, using stored fallback:", err.message);
      let list = [...getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS)];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.email.toLowerCase().includes(q) ||
            (o.mobile && o.mobile.toLowerCase().includes(q)) ||
            (o.department && o.department.toLowerCase().includes(q))
        );
      }
      if (status !== "all") list = list.filter((o) => o.status === status);
      if (approvalState !== "all") list = list.filter((o) => o.approval_state === approvalState);
      const total = list.length;
      const start = (page - 1) * limit;
      return {
        owners: list.slice(start, start + limit),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit))
      };
    }
  })();
}

export function getOwnerById(id) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    return list.find((o) => String(o.id) === String(id)) || null;
  }

  return (async () => {
    const res = await request(`/api/admin/owners/${id}`);
    const data = await handleJsonResponse(res);
    return data.owner || null;
  })();
}

export function addOwner(data) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);

    // Validate duplicate email
    const normalizedEmail = (data.email || "").trim().toLowerCase();
    if (list.some((o) => o.email.toLowerCase() === normalizedEmail)) {
      throw new Error(`An owner with email '${data.email}' already exists.`);
    }

    const newOwner = {
      id: Date.now(),
      name: data.name.trim(),
      email: normalizedEmail,
      mobile: (data.mobile || "").trim(),
      department: (data.department || "General Operations").trim(),
      status: data.status || "active",
      approval_state: data.approval_state || "approved",
      documents_count: 0,
      viewers_count: 0,
      created_at: new Date().toISOString(),
      last_login: null
    };

    const updated = [newOwner, ...list];
    setStored(STORAGE_KEYS.OWNERS, updated);
    return newOwner;
  }

  return (async () => {
    const res = await request("/api/admin/owners", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        department: data.department,
        status: data.status || "active",
        approval_state: data.approval_state || "approved"
      })
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.owner;
  })();
}

export function updateOwner(id, updates) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    const index = list.findIndex((o) => String(o.id) === String(id));
    if (index === -1) throw new Error("Owner not found.");

    if (updates.email) {
      const norm = updates.email.trim().toLowerCase();
      if (list.some((o, i) => i !== index && o.email.toLowerCase() === norm)) {
        throw new Error(`An owner with email '${updates.email}' already exists.`);
      }
      updates.email = norm;
    }

    const updatedOwner = { ...list[index], ...updates };
    list[index] = updatedOwner;
    setStored(STORAGE_KEYS.OWNERS, list);
    return updatedOwner;
  }

  return (async () => {
    const res = await request(`/api/admin/owners/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.owner;
  })();
}

export function toggleOwnerStatus(id, newStatus, reason = "") {
  if (isMockActive()) {
    return updateOwner(id, { status: newStatus });
  }

  return (async () => {
    const res = await request(`/api/admin/owners/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, reason })
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.owner;
  })();
}

export function importOwnersBulk(parsedRows) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    const existingEmails = new Set(list.map((o) => o.email.toLowerCase()));

    const added = [];
    const errors = [];

    parsedRows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const email = (row.email || "").trim().toLowerCase();
      const name = (row.name || "").trim();

      if (!email) {
        errors.push({ row: rowNum, error: "Missing email address." });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, email, error: "Invalid email format." });
        return;
      }
      if (!name) {
        errors.push({ row: rowNum, email, error: "Missing owner name." });
        return;
      }
      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, email, error: `Email '${email}' is already registered.` });
        return;
      }

      existingEmails.add(email);
      const newOwner = {
        id: Date.now() + idx,
        name,
        email,
        mobile: (row.mobile || "").trim(),
        department: (row.department || "Operations").trim(),
        status: row.status === "inactive" ? "inactive" : "active",
        approval_state: row.approval_state === "pending" ? "pending" : "approved",
        documents_count: 0,
        viewers_count: 0,
        created_at: new Date().toISOString(),
        last_login: null
      };
      added.push(newOwner);
    });

    if (added.length > 0) {
      const updated = [...added, ...list];
      setStored(STORAGE_KEYS.OWNERS, updated);
    }

    return { addedCount: added.length, errors, importedOwners: added };
  }

  return (async () => {
    const headers = ["name", "email", "mobile", "department", "status", "approval_state"];
    const csvLines = [headers.join(",")];
    parsedRows.forEach((r) => {
      const row = [
        `"${(r.name || "").replace(/"/g, '""')}"`,
        `"${(r.email || "").replace(/"/g, '""')}"`,
        `"${(r.mobile || "").replace(/"/g, '""')}"`,
        `"${(r.department || "").replace(/"/g, '""')}"`,
        `"${(r.status || "active").replace(/"/g, '""')}"`,
        `"${(r.approval_state || "approved").replace(/"/g, '""')}"`
      ];
      csvLines.push(row.join(","));
    });
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, "owners_import.csv");

    const res = await request("/api/admin/owners/import", {
      method: "POST",
      body: formData
    });
    const dataRes = await handleJsonResponse(res);
    return {
      addedCount: dataRes.addedCount || 0,
      skippedCount: dataRes.skippedCount || 0,
      errors: dataRes.errors || [],
      importedOwners: dataRes.owners || []
    };
  })();
}

// -------------------------------------------------------------
// Viewers API (Owner Scope)
// -------------------------------------------------------------

export function getViewers({
  ownerId,
  search = "",
  status = "all",
  accessState = "all",
  sortBy = "created_at",
  sortDir = "desc",
  page = 1,
  limit = 10
} = {}) {
  if (isMockActive()) {
    let list = [...getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS)];

    // Filter to specific owner if provided (communicating that Owners manage only their own Viewers)
    if (ownerId !== undefined && ownerId !== null) {
      list = list.filter((v) => String(v.owner_id) === String(ownerId));
    }

    // Search filter
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.email.toLowerCase().includes(q) ||
          (v.mobile && v.mobile.toLowerCase().includes(q)) ||
          (v.department && v.department.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (status !== "all") {
      list = list.filter((v) => v.status === status);
    }

    // Access state filter
    if (accessState !== "all") {
      list = list.filter((v) => v.access_state === accessState);
    }

    // Sorting
    list.sort((a, b) => {
      let valA = a[sortBy] ?? "";
      let valB = b[sortBy] ?? "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();
      if (valA < valB) return sortDir === "asc" ? -1 : 1;
      if (valA > valB) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const total = list.length;
    const start = (page - 1) * limit;
    const paginated = list.slice(start, start + limit);

    return {
      viewers: paginated,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit))
    };
  }

  return (async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status && status !== "all") params.set("status", status);
      if (page) params.set("page", String(page));
      if (limit) params.set("limit", String(limit));

      const res = await request(`/api/owner/viewers?${params.toString()}`);
      const data = await handleJsonResponse(res);
      return {
        viewers: data.viewers || [],
        total: data.total || 0,
        page: data.page || 1,
        totalPages: data.totalPages || 1
      };
    } catch (err) {
      console.warn("Backend owner viewers request failed, using stored fallback:", err.message);
      let list = [...getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS)];
      if (ownerId !== undefined && ownerId !== null) {
        list = list.filter((v) => String(v.owner_id) === String(ownerId));
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        list = list.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.email.toLowerCase().includes(q) ||
            (v.mobile && v.mobile.toLowerCase().includes(q)) ||
            (v.department && v.department.toLowerCase().includes(q))
        );
      }
      if (status !== "all") list = list.filter((v) => v.status === status);
      if (accessState !== "all") list = list.filter((v) => v.access_state === accessState);
      const total = list.length;
      const start = (page - 1) * limit;
      return {
        viewers: list.slice(start, start + limit),
        total,
        page,
        totalPages: Math.max(1, Math.ceil(total / limit))
      };
    }
  })();
}

export function getViewerById(id) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS);
    return list.find((v) => String(v.id) === String(id)) || null;
  }

  return (async () => {
    const res = await request(`/api/owner/viewers/${id}`);
    const data = await handleJsonResponse(res);
    return data.viewer || null;
  })();
}

export function addViewer(data, ownerId = 101) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS);

    const normalizedEmail = (data.email || "").trim().toLowerCase();
    if (list.some((v) => v.email.toLowerCase() === normalizedEmail)) {
      throw new Error(`A viewer with email '${data.email}' already exists.`);
    }

    const newViewer = {
      id: Date.now(),
      owner_id: ownerId,
      name: data.name.trim(),
      email: normalizedEmail,
      mobile: (data.mobile || "").trim(),
      department: (data.department || "Field Operations").trim(),
      status: data.status || "active",
      access_state: data.access_state || "granted",
      assigned_documents: data.assigned_documents || [],
      created_at: new Date().toISOString(),
      last_login: null
    };

    const updated = [newViewer, ...list];
    setStored(STORAGE_KEYS.VIEWERS, updated);
    return newViewer;
  }

  return (async () => {
    const res = await request("/api/owner/viewers", {
      method: "POST",
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        department: data.department,
        status: data.status || "active",
        access_state: data.access_state || "granted"
      })
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.viewer;
  })();
}

export function updateViewer(id, updates) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS);
    const index = list.findIndex((v) => String(v.id) === String(id));
    if (index === -1) throw new Error("Viewer not found.");

    if (updates.email) {
      const norm = updates.email.trim().toLowerCase();
      if (list.some((v, i) => i !== index && v.email.toLowerCase() === norm)) {
        throw new Error(`A viewer with email '${updates.email}' already exists.`);
      }
      updates.email = norm;
    }

    const updatedViewer = { ...list[index], ...updates };
    list[index] = updatedViewer;
    setStored(STORAGE_KEYS.VIEWERS, list);
    return updatedViewer;
  }

  return (async () => {
    const res = await request(`/api/owner/viewers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.viewer;
  })();
}

export function toggleViewerStatus(id, newStatus, reason = "") {
  if (isMockActive()) {
    return updateViewer(id, { status: newStatus });
  }

  return (async () => {
    const res = await request(`/api/owner/viewers/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, reason })
    });
    const dataRes = await handleJsonResponse(res);
    return dataRes.viewer;
  })();
}

export function importViewersBulk(parsedRows, ownerId = 101) {
  if (isMockActive()) {
    const list = getStored(STORAGE_KEYS.VIEWERS, INITIAL_VIEWERS);
    const existingEmails = new Set(list.map((v) => v.email.toLowerCase()));

    const added = [];
    const errors = [];

    parsedRows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const email = (row.email || "").trim().toLowerCase();
      const name = (row.name || "").trim();

      if (!email) {
        errors.push({ row: rowNum, error: "Missing email address." });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNum, email, error: "Invalid email format." });
        return;
      }
      if (!name) {
        errors.push({ row: rowNum, email, error: "Missing viewer name." });
        return;
      }
      if (existingEmails.has(email)) {
        errors.push({ row: rowNum, email, error: `Email '${email}' is already registered.` });
        return;
      }

      existingEmails.add(email);
      const newViewer = {
        id: Date.now() + idx,
        owner_id: ownerId,
        name,
        email,
        mobile: (row.mobile || "").trim(),
        department: (row.department || "Operations").trim(),
        status: row.status === "suspended" ? "suspended" : row.status === "inactive" ? "inactive" : "active",
        access_state: row.access_state === "restricted" ? "restricted" : "granted",
        assigned_documents: [],
        created_at: new Date().toISOString(),
        last_login: null
      };
      added.push(newViewer);
    });

    if (added.length > 0) {
      const updated = [...added, ...list];
      setStored(STORAGE_KEYS.VIEWERS, updated);
    }

    return { addedCount: added.length, errors, importedViewers: added };
  }

  return (async () => {
    const headers = ["name", "email", "mobile", "department", "status", "access_state"];
    const csvLines = [headers.join(",")];
    parsedRows.forEach((r) => {
      const row = [
        `"${(r.name || "").replace(/"/g, '""')}"`,
        `"${(r.email || "").replace(/"/g, '""')}"`,
        `"${(r.mobile || "").replace(/"/g, '""')}"`,
        `"${(r.department || "").replace(/"/g, '""')}"`,
        `"${(r.status || "active").replace(/"/g, '""')}"`,
        `"${(r.access_state || "granted").replace(/"/g, '""')}"`
      ];
      csvLines.push(row.join(","));
    });
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, "viewers_import.csv");

    const res = await request("/api/owner/viewers/import", {
      method: "POST",
      body: formData
    });
    const dataRes = await handleJsonResponse(res);
    return {
      addedCount: dataRes.addedCount || 0,
      skippedCount: dataRes.skippedCount || 0,
      errors: dataRes.errors || [],
      importedViewers: dataRes.viewers || []
    };
  })();
}

// -------------------------------------------------------------
// Sample Templates Generator (CSV)
// -------------------------------------------------------------

export function generateSampleCsv(type = "owners") {
  if (type === "owners") {
    return [
      "Name,Email,Mobile,Department,Status,Approval State",
      "Marcus Vance,marcus.vance@company.com,+1 (555) 123-4567,Enterprise Security,active,approved",
      "Priya Patel,priya.patel@company.com,+1 (555) 234-5678,Audit & Compliance,active,approved",
      "Jordan Miller,jordan.m@company.com,+1 (555) 345-6789,Financial Analytics,pending,pending"
    ].join("\n");
  }

  return [
    "Name,Email,Mobile,Department,Status,Access State",
    "Samantha Ray,samantha.r@partner.com,+1 (555) 987-1234,Contractor Audit,active,granted",
    "Kenneth Cole,k.cole@legalteam.com,+1 (555) 876-2345,External Legal,active,granted",
    "Amina Yusuf,amina.y@vendorcorp.com,+1 (555) 765-3456,Procurement Review,inactive,restricted"
  ].join("\n");
}
