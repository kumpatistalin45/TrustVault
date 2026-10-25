/**
 * TrustVault Centralized API Service
 * Manages HTTP requests, session credentials, CSRF token lifecycle, error normalization,
 * and seamless offline fallback to mock services for UI testing and disconnected environments.
 */

import {
  MOCK_USERS,
  MOCK_DOCUMENTS,
  MOCK_PERMISSIONS,
  MOCK_AUDIT_LOGS,
  MOCK_USERS_LIST,
  MOCK_ADMIN_STATS,
  MOCK_ADMIN_COMPLAINTS,
  MOCK_PERMISSION_HISTORY
} from "./mockData";
import { decryptDocumentInBrowser } from "../utils/crypto";

let cachedCsrfToken = null;

// In-memory working copies for mock/offline testing
export let adminUsersList = [...MOCK_USERS_LIST];
export let adminComplaintsList = [...MOCK_ADMIN_COMPLAINTS];
export let adminPermissionHistory = [...MOCK_PERMISSION_HISTORY];

export function isMockActive() {
  if (typeof window === "undefined") return false;
  const val = localStorage.getItem("tv_mock_mode");
  if (val === "true") return true;
  if (val === "false") return false;

  // In automated test environments (Vitest), mock mode is enabled so unit tests don't require live backend
  if (import.meta.env?.MODE === "test" || import.meta.env?.VITEST) {
    return true;
  }

  // In production builds and default dev, mock mode is disabled to connect to live backend
  if (import.meta.env?.PROD) {
    return false;
  }

  return import.meta.env?.VITE_USE_MOCK === "true";
}

/**
 * Determines whether API failures may safely fall back to mock data.
 * IN PRODUCTION OR WHEN MOCK MODE IS INACTIVE, THIS ALWAYS RETURNS FALSE.
 * Real backend errors MUST propagate to the UI so users see actual error states,
 * retry banners, and toasts, rather than silently switching to fake mock data.
 */
export function shouldFallbackToMock() {
  if (import.meta.env?.PROD) return false;
  return isMockActive();
}

export async function fetchCsrfToken() {
  if (isMockActive()) {
    cachedCsrfToken = "mock-csrf-token-offline";
    return cachedCsrfToken;
  }
  try {
    const res = await fetch("/api/auth/csrf-token", {
      method: "GET",
      credentials: "include"
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch CSRF token: ${res.status}`);
    }
    const data = await res.json();
    cachedCsrfToken = data.csrfToken;
    return cachedCsrfToken;
  } catch (error) {
    if (!shouldFallbackToMock()) {
      throw error;
    }
    console.warn("Could not fetch CSRF token from server:", error.message);
    cachedCsrfToken = "mock-csrf-token-offline";
    return cachedCsrfToken;
  }
}

export function setCachedCsrfToken(token) {
  cachedCsrfToken = token;
}

export function getCachedCsrfToken() {
  return cachedCsrfToken;
}

export async function request(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };

  // Attach CSRF token for state-changing requests
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    if (!cachedCsrfToken) {
      await fetchCsrfToken();
    }
    if (cachedCsrfToken) {
      headers["X-CSRF-Token"] = cachedCsrfToken;
    }
  }

  // Set default JSON Content-Type unless body is FormData
  if (!(options.body instanceof FormData) && !headers["Content-Type"] && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  const config = {
    ...options,
    method,
    headers,
    credentials: "include"
  };

  const response = await fetch(url, config);

  // If 403 CSRF token error occurs, try refreshing token once and retrying
  if (response.status === 403 && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const errorJson = await response.clone().json().catch(() => null);
    if (errorJson?.error === "Invalid CSRF token") {
      const freshToken = await fetchCsrfToken();
      if (freshToken) {
        headers["X-CSRF-Token"] = freshToken;
        return fetch(url, { ...config, headers });
      }
    }
  }

  return response;
}

export async function handleJsonResponse(response) {
  let data;
  try {
    data = await response.json();
  } catch (_e) {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.error || `HTTP error ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// --------------------------------------------------
// Authentication API
// --------------------------------------------------

export async function apiRegister({ name, email, password, role }) {
  if (isMockActive()) {
    const mockUser = {
      id: Date.now(),
      name: name || "Test User",
      email: email || "user@trustvault.internal",
      role: role || "owner",
      created_at: new Date().toISOString()
    };
    return { user: mockUser };
  }
  try {
    const res = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role })
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return {
      user: {
        id: Date.now(),
        name: name || "Test User",
        email: email || "user@trustvault.internal",
        role: role || "owner",
        created_at: new Date().toISOString()
      }
    };
  }
}

export async function apiLogin({ username, email, password, role: passedRole }) {
  if (isMockActive()) {
    const ident = (username || email || "").toLowerCase();
    const role = passedRole || (ident.includes("admin") ? "admin" : ident.includes("viewer") ? "viewer" : "owner");
    const mockProfile = MOCK_USERS[role] || {
      id: role === "admin" ? 1 : role === "owner" ? 2 : 3,
      name: (username || email || "").split("@")[0] || (role === "admin" ? "Alex Vance" : role === "owner" ? "Jane Doe" : "Bob Smith"),
      email: (email || username || "").includes("@") ? (email || username) : `${email || username}@trustvault.internal`,
      role,
      created_at: new Date().toISOString()
    };
    return { user: mockProfile, csrfToken: "mock-csrf-token" };
  }

  const res = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, email, password, role: passedRole })
  });
  const data = await handleJsonResponse(res);
  if (data?.csrfToken) {
    setCachedCsrfToken(data.csrfToken);
  }
  return data;
}

export async function apiFirebaseLogin({ idToken }) {
  if (isMockActive()) {
    return { user: MOCK_USERS.owner, csrfToken: "mock-csrf-token" };
  }

  const res = await request("/api/auth/firebase-login", {
    method: "POST",
    body: JSON.stringify({ idToken })
  });
  const data = await handleJsonResponse(res);
  if (data?.csrfToken) {
    setCachedCsrfToken(data.csrfToken);
  }
  return data;
}

// --------------------------------------------------
// MSG91 Corporate Email OTP Authentication
// --------------------------------------------------

export async function apiSendEmailOtp({ email }) {
  if (isMockActive()) {
    return {
      success: true,
      message: "Verification code dispatched to your corporate email.",
      cooldownSeconds: 60,
      email
    };
  }

  const res = await request("/api/auth/email-otp/send", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  return handleJsonResponse(res);
}

export async function apiVerifyEmailOtp({ email, otp, role: passedRole }) {
  if (isMockActive()) {
    const ident = (email || "").toLowerCase();
    const role = passedRole || (ident.includes("viewer") ? "viewer" : "owner");
    const mockUser = MOCK_USERS[role] || {
      id: role === "owner" ? 2 : 3,
      name: (email || "").split("@")[0] || (role === "owner" ? "Jane Doe" : "Bob Smith"),
      email,
      role,
      status: "active",
      created_at: new Date().toISOString()
    };
    return { success: true, user: mockUser, csrfToken: "mock-csrf-token" };
  }

  const res = await request("/api/auth/email-otp/verify", {
    method: "POST",
    body: JSON.stringify({ email, otp })
  });
  const data = await handleJsonResponse(res);
  if (data?.csrfToken) {
    setCachedCsrfToken(data.csrfToken);
  }
  return data;
}

export async function apiRetryEmailOtp({ email }) {
  if (isMockActive()) {
    return {
      success: true,
      message: "Verification code resent successfully.",
      cooldownSeconds: 60
    };
  }

  const res = await request("/api/auth/email-otp/retry", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  return handleJsonResponse(res);
}

export async function apiGetEmailOtpStatus() {
  if (isMockActive()) {
    return { configured: true };
  }
  const res = await request("/api/auth/email-otp/status", { method: "GET" });
  return handleJsonResponse(res);
}

// --------------------------------------------------
// Firebase Passwordless Email Link Authentication API
// --------------------------------------------------

/**
 * Request a Firebase sign-in link to be sent to the given email.
 * Returns { success, message, cooldownSeconds, expiresInMinutes, expiresAt }
 */
export async function apiSendEmailLink({ email }) {
  if (isMockActive()) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return {
      success: true,
      message: "A secure sign-in link has been sent to your email address. It expires in 10 minutes.",
      cooldownSeconds: 60,
      expiresInMinutes: 10,
      expiresAt
    };
  }
  const res = await request("/api/auth/email-link/send", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  return handleJsonResponse(res);
}

/**
 * Regenerate / resend a Firebase sign-in link for the same email.
 * Previous link is revoked. Returns same shape as apiSendEmailLink.
 */
export async function apiRegenerateEmailLink({ email }) {
  if (isMockActive()) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return {
      success: true,
      message: "A new sign-in link has been sent. It expires in 10 minutes.",
      cooldownSeconds: 60,
      expiresInMinutes: 10,
      expiresAt
    };
  }
  const res = await request("/api/auth/email-link/regenerate", {
    method: "POST",
    body: JSON.stringify({ email })
  });
  return handleJsonResponse(res);
}

/**
 * Complete Firebase email-link authentication.
 * Sends Firebase ID token and application token to backend for dual verification.
 * Returns { success, user, csrfToken }
 */
export async function apiCompleteEmailLink({ idToken, apiToken }) {
  if (isMockActive()) {
    return { success: true, user: MOCK_USERS.owner, csrfToken: "mock-csrf-token" };
  }
  const res = await request("/api/auth/email-link/complete", {
    method: "POST",
    body: JSON.stringify({ idToken, apiToken })
  });
  const data = await handleJsonResponse(res);
  if (data?.csrfToken) {
    setCachedCsrfToken(data.csrfToken);
  }
  return data;
}

/**
 * Check the status of an application token (for countdown display).
 * Returns { valid, expiresAt, remainingSeconds, reason }
 */
export async function apiGetEmailLinkStatus({ token }) {
  if (isMockActive()) {
    return { valid: true, remainingSeconds: 590 };
  }
  const res = await request(`/api/auth/email-link/status?token=${encodeURIComponent(token)}`, { method: "GET" });
  return handleJsonResponse(res);
}

export async function apiGetMe() {
  if (isMockActive()) {
    const saved = localStorage.getItem("tv_user");
    return { user: saved ? JSON.parse(saved) : MOCK_USERS.owner };
  }
  try {
    const res = await request("/api/auth/me", { method: "GET" });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const saved = localStorage.getItem("tv_user");
    return { user: saved ? JSON.parse(saved) : MOCK_USERS.owner };
  }
}

export async function apiLogout() {
  if (isMockActive()) {
    cachedCsrfToken = null;
    return { success: true };
  }
  try {
    const res = await request("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
    cachedCsrfToken = null;
    return handleJsonResponse(res);
  } catch (_e) {
    cachedCsrfToken = null;
    if (!shouldFallbackToMock()) throw _e;
    return { success: true };
  }
}

export async function apiUpdateProfile({ name, mobile, avatar_url }) {
  if (isMockActive()) {
    const saved = localStorage.getItem("tv_user");
    const user = saved ? JSON.parse(saved) : { id: 1, name: "Admin", email: "admin@trustvault.internal" };
    const updated = {
      ...user,
      ...(name ? { name } : {}),
      ...(mobile ? { mobile } : {}),
      ...(avatar_url !== undefined ? { avatar_url } : {})
    };
    localStorage.setItem("tv_user", JSON.stringify(updated));
    return { success: true, user: updated };
  }
  const res = await request("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ name, mobile, avatar_url })
  });
  return handleJsonResponse(res);
}

export async function apiChangePassword({ currentPassword, newPassword }) {
  if (isMockActive()) {
    return { success: true, message: "Password updated successfully" };
  }
  const res = await request("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword })
  });
  return handleJsonResponse(res);
}

// --------------------------------------------------
// Documents API
// --------------------------------------------------

function getFilteredDocumentsBySession(allDocs, filters = {}) {
  let currentUser = null;
  try {
    const saved = localStorage.getItem("tv_user");
    if (saved) currentUser = JSON.parse(saved);
  } catch (_e) {}

  let docs = [...allDocs];
  const userRole = (currentUser?.role || "viewer").toLowerCase();
  const userId = currentUser?.id;
  const userEmail = (currentUser?.email || "").toLowerCase();

  if (userRole === "viewer") {
    // Viewers ONLY see documents that have been assigned to them by an owner
    docs = docs
      .filter((d) => {
        const perms = MOCK_PERMISSIONS[d.id] || [];
        return perms.some(
          (p) =>
            (userId && String(p.user_id) === String(userId)) ||
            (userEmail && p.user_email?.toLowerCase() === userEmail) ||
            (String(userId) === "3" && (p.user_id === 3 || p.user_email?.includes("viewer")))
        );
      })
      .map((d) => {
        const perms = MOCK_PERMISSIONS[d.id] || [];
        const myPerm = perms.find(
          (p) =>
            (userId && String(p.user_id) === String(userId)) ||
            (userEmail && p.user_email?.toLowerCase() === userEmail) ||
            (String(userId) === "3" && (p.user_id === 3 || p.user_email?.includes("viewer")))
        );
        return {
          ...d,
          access_level: myPerm?.permission || "read"
        };
      });
  } else if (userRole === "owner") {
    // Owners ONLY see documents they own or that were explicitly granted to them
    docs = docs
      .filter((d) => {
        const isDocOwner =
          (userId && String(d.owner_id) === String(userId)) ||
          (userEmail && d.owner_email?.toLowerCase() === userEmail) ||
          d.access_level === "owner";
        if (isDocOwner) return true;
        const perms = MOCK_PERMISSIONS[d.id] || [];
        return perms.some(
          (p) =>
            (userId && String(p.user_id) === String(userId)) ||
            (userEmail && p.user_email?.toLowerCase() === userEmail)
        );
      })
      .map((d) => {
        const isDocOwner =
          (userId && String(d.owner_id) === String(userId)) ||
          (userEmail && d.owner_email?.toLowerCase() === userEmail) ||
          d.access_level === "owner";
        if (isDocOwner) return { ...d, access_level: "owner" };
        const perms = MOCK_PERMISSIONS[d.id] || [];
        const myPerm = perms.find(
          (p) =>
            (userId && String(p.user_id) === String(userId)) ||
            (userEmail && p.user_email?.toLowerCase() === userEmail)
        );
        return {
          ...d,
          access_level: myPerm?.permission || "read"
        };
      });
  }

  if (filters.name) {
    docs = docs.filter((d) => d.name.toLowerCase().includes(filters.name.toLowerCase()));
  }
  if (filters.category) {
    docs = docs.filter((d) => d.category.toLowerCase() === filters.category.toLowerCase());
  }
  if (filters.owner) {
    docs = docs.filter((d) => d.owner_name.toLowerCase().includes(filters.owner.toLowerCase()));
  }

  return { documents: docs, total: docs.length };
}

export async function apiGetDocuments(filters = {}) {
  if (isMockActive()) {
    return getFilteredDocumentsBySession(MOCK_DOCUMENTS, filters);
  }
  try {
    const params = new URLSearchParams();
    if (filters.name) params.append("name", filters.name);
    if (filters.owner) params.append("owner", filters.owner);
    if (filters.category) params.append("category", filters.category);
    if (filters.from) params.append("from", filters.from);
    if (filters.to) params.append("to", filters.to);
    if (filters.limit) params.append("limit", filters.limit);
    if (filters.offset) params.append("offset", filters.offset);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const res = await request(`/api/documents${queryStr}`, { method: "GET" });
    const data = await handleJsonResponse(res);
    // If backend returns documents, ensure client role rules also sanitize view
    if (data?.documents) {
      let currentUser = null;
      try {
        const saved = localStorage.getItem("tv_user");
        if (saved) currentUser = JSON.parse(saved);
      } catch (_e) {}
      if (currentUser?.role === "viewer") {
        data.documents = data.documents.filter(
          (d) => d.access_level === "read" || d.access_level === "edit"
        );
      }
    }
    return data;
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return getFilteredDocumentsBySession(MOCK_DOCUMENTS, filters);
  }
}

export async function apiGetDocument(id) {
  if (isMockActive()) {
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id)) || MOCK_DOCUMENTS[0];
    return { document: doc };
  }
  try {
    const res = await request(`/api/documents/${id}`, { method: "GET" });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id)) || MOCK_DOCUMENTS[0];
    return { document: doc };
  }
}

export async function apiUploadDocument(formData) {
  if (isMockActive()) {
    const file = formData.get("file");
    const category = formData.get("category") || "General";
    const customName = formData.get("name");
    const newDoc = {
      id: Date.now(),
      name: customName?.trim() || file?.name || "Uploaded_Secure_File.pdf",
      category,
      mime_type: file?.type || "application/pdf",
      size_bytes: file?.size || 1048576,
      owner_id: 2,
      owner_name: "Jane Doe (Owner)",
      owner_email: "jane.owner@trustvault.internal",
      access_level: "owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    MOCK_DOCUMENTS.unshift(newDoc);
    return { document: newDoc };
  }
  try {
    const res = await request("/api/documents", {
      method: "POST",
      body: formData
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const customName = formData.get("name");
    const newDoc = {
      id: Date.now(),
      name: customName?.trim() || "Uploaded_Secure_File.pdf",
      category: formData.get("category") || "General",
      mime_type: "application/pdf",
      size_bytes: 1048576,
      owner_id: 2,
      owner_name: "Current Employee",
      access_level: "owner",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    MOCK_DOCUMENTS.unshift(newDoc);
    return { document: newDoc };
  }
}

export async function apiUpdateDocument(id, updates = {}) {
  const { name, category, timer_enabled, timer_duration_minutes, auto_delete } = updates;
  if (isMockActive()) {
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id));
    if (doc) {
      if (name !== undefined) doc.name = name;
      if (category !== undefined) doc.category = category;
      if (timer_enabled !== undefined) doc.timer_enabled = timer_enabled;
      if (timer_duration_minutes !== undefined) doc.timer_duration_minutes = timer_duration_minutes;
      if (auto_delete !== undefined) doc.auto_delete = auto_delete;
      doc.updated_at = new Date().toISOString();
      return { document: doc };
    }
    return { document: { ...MOCK_DOCUMENTS[0], ...updates } };
  }
  try {
    const res = await request(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates)
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id));
    if (doc) {
      Object.assign(doc, updates);
      return { document: doc };
    }
    return { document: { ...MOCK_DOCUMENTS[0], ...updates } };
  }
}

export async function apiUnlockDocument(id, secretKey = "") {
  if (isMockActive()) {
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id));
    return {
      success: true,
      document: doc,
      timer_duration_minutes: doc?.timer_duration_minutes || 5,
      auto_delete: doc?.auto_delete !== false
    };
  }
  try {
    const res = await request(`/api/documents/${id}/unlock`, {
      method: "POST",
      body: JSON.stringify({ secretKey })
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id));
    return {
      success: true,
      document: doc,
      timer_duration_minutes: doc?.timer_duration_minutes || 5,
      auto_delete: doc?.auto_delete !== false
    };
  }
}

// --------------------------------------------------
// Confirmed Download History Tracking
// --------------------------------------------------

export function recordConfirmedDownload(docOrId, filename, meta = {}) {
  try {
    const historyKey = "tv_confirmed_downloads";
    const existing = JSON.parse(localStorage.getItem(historyKey) || "[]");
    const docId = typeof docOrId === "object" ? docOrId.id : docOrId;
    const docName = typeof docOrId === "object" ? docOrId.name : filename || `Document_${docId}`;
    const sizeBytes = typeof docOrId === "object" ? docOrId.size_bytes : meta.size_bytes || null;
    const category = typeof docOrId === "object" ? docOrId.category : meta.category || "General";
    const mimeType = typeof docOrId === "object" ? docOrId.mime_type : meta.mime_type || "application/pdf";

    const record = {
      id: `DL-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      document_id: docId,
      document_name: docName,
      category,
      mime_type: mimeType,
      size_bytes: sizeBytes,
      timestamp: new Date().toISOString(),
      status: "CONFIRMED"
    };

    existing.unshift(record);
    if (existing.length > 50) existing.pop();
    localStorage.setItem(historyKey, JSON.stringify(existing));
    return record;
  } catch (err) {
    console.warn("Could not save download to confirmed history:", err);
    return null;
  }
}

export async function apiGetDownloadHistory() {
  // Service boundary: Query server endpoint if backend implements unprivileged user history
  if (!isMockActive()) {
    try {
      const res = await request("/api/documents/downloads", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data.downloads) return data;
      } else if (!shouldFallbackToMock()) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Download history request failed with status ${res.status}`);
      }
    } catch (_e) {
      if (!shouldFallbackToMock()) throw _e;
    }
  }

  try {
    const historyKey = "tv_confirmed_downloads";
    const history = JSON.parse(localStorage.getItem(historyKey) || "[]");
    return { downloads: history, total: history.length };
  } catch (_e) {
    return { downloads: [], total: 0 };
  }
}

export async function apiDownloadDocument(id, suggestedFilename = "document.pdf", docMeta = {}) {
  let blob;
  const isTxt = suggestedFilename.endsWith(".txt");

  if (isMockActive()) {
    // Generate verified decrypted blob for offline evaluation
    const content = `[TRUSTVAULT ENTERPRISE SECURE FILE STREAM]\n\nDocument ID: ${id}\nFile: ${suggestedFilename}\nDecrypted via: AES-256-GCM Envelope Encryption (TVE1 Header Validated)\nIntegrity HMAC: OK (SHA-256 Verified)\nTimestamp: ${new Date().toISOString()}\n\nThis is a verified decrypted document payload for testing purposes.`;
    blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  } else {
    const res = await request(`/api/documents/${id}/download`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Download failed (${res.status})`);
    }
    blob = await res.blob();
  }

  // Create temporary in-memory blob URL
  const blobUrl = window.URL.createObjectURL(blob);

  // Trigger browser download for the user
  const a = document.createElement("a");
  a.style.display = "none";
  a.href = blobUrl;
  a.download = isTxt ? suggestedFilename : suggestedFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Record confirmed download history
  recordConfirmedDownload(id, suggestedFilename, docMeta);

  // Return decrypted blob and object URL to caller for temporary access tracking
  return { blob, blobUrl };
}

/**
 * Fetch Decrypted Document Preview for In-App Viewing (Viewers & Authorized Users)
 * Streams decrypted payload without initiating a file download
 */
export async function apiPreviewDocument(id) {
  if (isMockActive()) {
    const doc = MOCK_DOCUMENTS.find((d) => String(d.id) === String(id)) || MOCK_DOCUMENTS[0];
    const isPdf = doc?.name?.toLowerCase().endsWith(".pdf") || doc?.mime_type === "application/pdf";
    const isImage = /\.(png|jpe?g|gif|webp)$/i.test(doc?.name || "") || doc?.mime_type?.startsWith("image/");
    const mime = isPdf ? "application/pdf" : isImage ? "image/png" : "text/plain;charset=utf-8";
    const sampleContent = isPdf
      ? "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources <<>> /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n214\n%%EOF"
      : `[TRUSTVAULT PROTECTED DOCUMENT STREAM]\nDocument: ${doc?.name || "Encrypted_File.pdf"}\nEncryption: AES-256-GCM Envelope Sealed\nAccess Mode: In-App View Only (Download Restricted)\nTimestamp: ${new Date().toISOString()}`;
    const blob = new Blob([sampleContent], { type: mime });
    const blobUrl = window.URL.createObjectURL(blob);
    return { blob, blobUrl, mimeType: mime, name: doc?.name, cleanup: () => window.URL.revokeObjectURL(blobUrl) };
  }

  // 1. Request secure preview-package for in-browser Web Crypto API decryption
  try {
    const pkgRes = await request(`/api/documents/${id}/preview-package`, { method: "GET" });
    if (pkgRes.ok) {
      const data = await pkgRes.json();
      const decryptedBuf = await decryptDocumentInBrowser({
        dekHex: data.dek,
        ivHex: data.iv,
        authTagHex: data.authTag,
        ciphertextBase64: data.ciphertext
      });

      const mime = data.mimeType || "application/octet-stream";
      const blob = new Blob([decryptedBuf], { type: mime });
      const blobUrl = window.URL.createObjectURL(blob);

      return {
        blob,
        blobUrl,
        mimeType: mime,
        name: data.name,
        encryptionVersion: data.encryptionVersion,
        keyId: data.keyId,
        cleanup: () => {
          try {
            window.URL.revokeObjectURL(blobUrl);
          } catch (_e) {}
        }
      };
    } else if (pkgRes.status === 403 || pkgRes.status === 401 || pkgRes.status === 404) {
      const errorJson = await pkgRes.json().catch(() => null);
      const err = new Error(errorJson?.error || `Preview request denied (${pkgRes.status})`);
      err.status = pkgRes.status;
      err.data = errorJson;
      throw err;
    }
  } catch (err) {
    if (err.status === 403 || err.status === 401 || err.status === 404 || err.message?.includes("Authentication tag verification failed")) {
      throw err;
    }
    // Fall back to server-side preview stream if preview-package endpoint was temporarily unavailable
  }

  // 2. Direct preview fallback
  const res = await request(`/api/documents/${id}/preview`, { method: "GET" });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => null);
    const err = new Error(errorJson?.error || `Preview request failed (${res.status})`);
    err.status = res.status;
    err.data = errorJson;
    throw err;
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  return {
    blob,
    blobUrl,
    mimeType: contentType,
    cleanup: () => {
      try {
        window.URL.revokeObjectURL(blobUrl);
      } catch (_e) {}
    }
  };
}

export async function apiDeleteDocument(id) {
  if (isMockActive()) {
    const idx = MOCK_DOCUMENTS.findIndex((d) => String(d.id) === String(id));
    if (idx !== -1) MOCK_DOCUMENTS.splice(idx, 1);
    return { message: "Document deleted successfully" };
  }
  try {
    const res = await request(`/api/documents/${id}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return { message: "Document deleted successfully" };
  }
}

// --------------------------------------------------
// Permissions API
// --------------------------------------------------

/**
 * Fetch eligible registered users for discretionary access grant.
 * Supports exact search (exact email or unique ID) and role filtering.
 */
export async function apiGetEligibleUsers(params = {}) {
  const { search = "", role = "all", exact = false, excludeId = null, excludeEmail = null } = params;
  const isExact = exact === true || exact === "true";

  if (isMockActive()) {
    let filtered = adminUsersList.map((u) => ({
      ...u,
      unique_id: u.unique_id || `TV-USR-00${u.id}`
    }));

    if (excludeId) {
      filtered = filtered.filter((u) => String(u.id) !== String(excludeId));
    }
    if (excludeEmail) {
      filtered = filtered.filter((u) => u.email.toLowerCase() !== String(excludeEmail).toLowerCase());
    }

    if (role && role !== "all") {
      filtered = filtered.filter((u) => u.role.toLowerCase() === role.toLowerCase());
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      if (isExact) {
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase() === q ||
            u.unique_id.toLowerCase() === q ||
            `#${u.id}` === q ||
            String(u.id) === q ||
            u.name.toLowerCase() === q
        );
      } else {
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            u.unique_id.toLowerCase().includes(q) ||
            `#${u.id}` === q ||
            String(u.id) === q ||
            u.name.toLowerCase().includes(q)
        );
      }
    }

    return { users: filtered };
  }

  try {
    const qParams = new URLSearchParams();
    if (search) qParams.set("search", search);
    if (role && role !== "all") qParams.set("role", role);
    if (isExact) qParams.set("exact", "true");

    const res = await request(`/api/users/eligible?${qParams.toString()}`, {
      method: "GET"
    });
    const data = await handleJsonResponse(res);
    let users = (data.users || []).map((u) => ({
      ...u,
      unique_id: u.unique_id || `TV-USR-00${u.id}`
    }));
    if (excludeEmail) {
      users = users.filter((u) => u.email.toLowerCase() !== String(excludeEmail).toLowerCase());
    }
    return { users };
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    // Offline fallback
    let filtered = adminUsersList.map((u) => ({
      ...u,
      unique_id: u.unique_id || `TV-USR-00${u.id}`
    }));
    if (excludeId) {
      filtered = filtered.filter((u) => String(u.id) !== String(excludeId));
    }
    if (excludeEmail) {
      filtered = filtered.filter((u) => u.email.toLowerCase() !== String(excludeEmail).toLowerCase());
    }
    if (role && role !== "all") {
      filtered = filtered.filter((u) => u.role.toLowerCase() === role.toLowerCase());
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      if (isExact) {
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase() === q ||
            u.unique_id.toLowerCase() === q ||
            `#${u.id}` === q ||
            String(u.id) === q ||
            u.name.toLowerCase() === q
        );
      } else {
        filtered = filtered.filter(
          (u) =>
            u.email.toLowerCase().includes(q) ||
            u.unique_id.toLowerCase().includes(q) ||
            `#${u.id}` === q ||
            String(u.id) === q ||
            u.name.toLowerCase().includes(q)
        );
      }
    }
    return { users: filtered };
  }
}

export async function apiGetPermissions(documentId) {
  if (isMockActive()) {
    const perms = (MOCK_PERMISSIONS[documentId] || []).map((p) => ({
      ...p,
      unique_id: p.unique_id || `TV-USR-00${p.user_id || p.id}`
    }));
    return { permissions: perms };
  }
  try {
    const res = await request(`/api/documents/${documentId}/permissions`, {
      method: "GET"
    });
    const data = await handleJsonResponse(res);
    const perms = (data.permissions || []).map((p) => ({
      ...p,
      unique_id: p.unique_id || `TV-USR-00${p.user_id || p.id}`
    }));
    return { permissions: perms };
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const perms = (MOCK_PERMISSIONS[documentId] || []).map((p) => ({
      ...p,
      unique_id: p.unique_id || `TV-USR-00${p.user_id || p.id}`
    }));
    return { permissions: perms };
  }
}

export async function apiGrantPermission(documentId, { email, userId, uniqueId, permission }) {
  if (isMockActive()) {
    let resolvedEmail = email;
    let resolvedName = email ? email.split("@")[0] : "Collaborator";
    let resolvedUserId = userId || (uniqueId ? Number(String(uniqueId).replace(/^tv-usr-0*/i, "").replace(/^#/, "")) : null);

    if (resolvedUserId && !resolvedEmail) {
      const match = adminUsersList.find((u) => Number(u.id) === Number(resolvedUserId));
      if (match) {
        resolvedEmail = match.email;
        resolvedName = match.name;
      }
    } else if (resolvedEmail && !resolvedUserId) {
      const match = adminUsersList.find((u) => u.email.toLowerCase() === resolvedEmail.toLowerCase());
      if (match) {
        resolvedUserId = match.id;
        resolvedName = match.name;
      } else {
        resolvedUserId = Math.floor(Math.random() * 900) + 10;
      }
    }

    const newPerm = {
      id: Date.now(),
      document_id: Number(documentId),
      user_id: resolvedUserId || 10,
      user_name: resolvedName,
      user_email: resolvedEmail || `user${resolvedUserId}@trustvault.internal`,
      unique_id: `TV-USR-00${resolvedUserId || 10}`,
      permission: permission || "read",
      created_at: new Date().toISOString()
    };
    if (!MOCK_PERMISSIONS[documentId]) MOCK_PERMISSIONS[documentId] = [];
    MOCK_PERMISSIONS[documentId].push(newPerm);
    return { permission: newPerm };
  }
  try {
    const res = await request(`/api/documents/${documentId}/permissions`, {
      method: "POST",
      body: JSON.stringify({ email, userId, uniqueId, permission })
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const newPerm = {
      id: Date.now(),
      document_id: Number(documentId),
      user_id: userId || 10,
      user_name: email ? email.split("@")[0] : "Collaborator",
      user_email: email,
      unique_id: `TV-USR-00${userId || 10}`,
      permission: permission || "read",
      created_at: new Date().toISOString()
    };
    return { permission: newPerm };
  }
}

export async function apiRevokePermission(documentId, userId) {
  if (isMockActive()) {
    if (MOCK_PERMISSIONS[documentId]) {
      MOCK_PERMISSIONS[documentId] = MOCK_PERMISSIONS[documentId].filter(
        (p) => String(p.user_id) !== String(userId)
      );
    }
    return { message: "Permission revoked" };
  }
  try {
    const res = await request(`/api/documents/${documentId}/permissions/${userId}`, {
      method: "DELETE",
      body: JSON.stringify({})
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return { message: "Permission revoked" };
  }
}

// --------------------------------------------------
// Admin Audit API
// --------------------------------------------------

export async function apiGetAuditLogs(filters = {}) {
  if (isMockActive()) {
    return {
      auditLogs: MOCK_AUDIT_LOGS,
      logs: MOCK_AUDIT_LOGS,
      total: MOCK_AUDIT_LOGS.length
    };
  }
  try {
    const params = new URLSearchParams();
    if (filters.action) params.append("action", filters.action);
    if (filters.outcome) params.append("outcome", filters.outcome);
    if (filters.actorId) params.append("actorId", filters.actorId);
    if (filters.documentId) params.append("documentId", filters.documentId);
    if (filters.from) params.append("from", filters.from);
    if (filters.to) params.append("to", filters.to);
    if (filters.limit) params.append("limit", filters.limit);
    if (filters.offset) params.append("offset", filters.offset);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const res = await request(`/api/admin/audit-logs${queryStr}`, { method: "GET" });
    const data = await handleJsonResponse(res);
    const list = data.auditLogs || data.logs || [];
    return {
      auditLogs: list,
      logs: list,
      total: data.total || list.length
    };
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return {
      auditLogs: MOCK_AUDIT_LOGS,
      logs: MOCK_AUDIT_LOGS,
      total: MOCK_AUDIT_LOGS.length
    };
  }
}

// --------------------------------------------------
// Document Owner Activity API (Integration Boundary)
// Contract Spec:
// GET /api/documents/activity?limit=&offset=&action=&outcome= -> { activity: [...], total: number }
// --------------------------------------------------

export async function apiGetOwnerActivity(filters = {}) {
  if (isMockActive()) {
    let logs = [...MOCK_AUDIT_LOGS];
    if (filters.action && filters.action !== "all") {
      logs = logs.filter((l) =>
        (l.action || "").toLowerCase().includes(filters.action.toLowerCase())
      );
    }
    if (filters.outcome && filters.outcome !== "all") {
      logs = logs.filter((l) =>
        (l.outcome || "").toLowerCase() === filters.outcome.toLowerCase()
      );
    }
    if (filters.documentId) {
      logs = logs.filter((l) => String(l.document_id) === String(filters.documentId));
    }
    return { activity: logs, total: logs.length };
  }

  try {
    const params = new URLSearchParams();
    if (filters.action) params.append("action", filters.action);
    if (filters.outcome) params.append("outcome", filters.outcome);
    if (filters.documentId) params.append("documentId", filters.documentId);
    if (filters.limit) params.append("limit", filters.limit);
    if (filters.offset) params.append("offset", filters.offset);

    const queryStr = params.toString() ? `?${params.toString()}` : "";
    const res = await request(`/api/documents/activity${queryStr}`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return { activity: data.activity || data.logs || [], total: data.total || (data.activity ? data.activity.length : 0) };
    }
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
  }

  if (!shouldFallbackToMock()) {
    throw new Error("Failed to load activity logs from server.");
  }

  return {
    activity: MOCK_AUDIT_LOGS,
    total: MOCK_AUDIT_LOGS.length,
    _boundaryNote: "GET /api/documents/activity endpoint pending backend implementation"
  };
}

// --------------------------------------------------
// Phase 2: Terms & Conditions Compliance API
// Contract Spec:
// GET  /api/auth/terms/status -> { currentVersion: "2026.1", accepted: boolean, acceptedVersion: string|null, acceptedAt: string|null }
// POST /api/auth/terms/accept -> { success: boolean, version: string, acceptedAt: string }
// --------------------------------------------------

export const CURRENT_TERMS_VERSION = "2026.1";

export async function apiGetTermsStatus() {
  if (isMockActive()) {
    const saved = localStorage.getItem("tv_terms_accepted_version");
    const isAccepted = saved === CURRENT_TERMS_VERSION;
    return {
      currentVersion: CURRENT_TERMS_VERSION,
      accepted: isAccepted,
      acceptedVersion: saved || null,
      acceptedAt: localStorage.getItem("tv_terms_accepted_at") || null
    };
  }

  try {
    const res = await request("/api/auth/terms/status", { method: "GET" });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    const saved = localStorage.getItem("tv_terms_accepted_version");
    return {
      currentVersion: CURRENT_TERMS_VERSION,
      accepted: saved === CURRENT_TERMS_VERSION,
      acceptedVersion: saved || null,
      acceptedAt: localStorage.getItem("tv_terms_accepted_at") || null,
      _backendPending: true
    };
  }
}

export async function apiAcceptTerms({ version = CURRENT_TERMS_VERSION }) {
  if (isMockActive()) {
    const now = new Date().toISOString();
    localStorage.setItem("tv_terms_accepted_version", version);
    localStorage.setItem("tv_terms_accepted_at", now);
    return {
      success: true,
      version,
      acceptedAt: now
    };
  }

  try {
    const res = await request("/api/auth/terms/accept", {
      method: "POST",
      body: JSON.stringify({ version })
    });
    const data = await handleJsonResponse(res);
    localStorage.setItem("tv_terms_accepted_version", version);
    localStorage.setItem("tv_terms_accepted_at", data?.acceptedAt || new Date().toISOString());
    return data;
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    console.warn("Terms acceptance API not found on backend. Falling back for frontend testing:", err.message);
    const now = new Date().toISOString();
    localStorage.setItem("tv_terms_accepted_version", version);
    localStorage.setItem("tv_terms_accepted_at", now);
    return {
      success: true,
      version,
      acceptedAt: now,
      _fallback: true
    };
  }
}

// --------------------------------------------------
// Phase 2: Help & Support / Complaints API
// Contract Spec:
// POST /api/support/complaints -> { complaint: { id, referenceId, category, subject, description, status, createdAt } }
// GET  /api/support/complaints -> { complaints: [...] }
// GET  /api/support/complaints/:id -> { complaint: {...}, timeline: [...] }
// POST /api/support/security-report -> { report: { id, referenceId, status, createdAt } }
// --------------------------------------------------

// In-memory / mock complaint storage for testing
const MOCK_COMPLAINTS = [
  {
    id: 1,
    referenceId: "TV-CMP-84920",
    category: "Document Access",
    subject: "Permission denied for Q4 Financial Statements",
    description: "I received notification that the document was assigned by my Admin, but upon clicking Unlock & Download, the system reported an authorization error.",
    relatedDocumentName: "Q4 Financial Statements 2026",
    status: "In Review",
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
        author: "Enterprise Support Agent (Tier 2)",
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
    relatedDocumentName: "N/A",
    status: "Resolved",
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
        author: "Support Lead",
        message: "SMTP gateway throttling policy adjusted. Delivery latency reduced to under 3 seconds.",
        timestamp: "2026-10-15T11:45:00Z",
        type: "agent"
      }
    ]
  }
];

export async function apiSubmitComplaint(data) {
  if (isMockActive()) {
    const randomRef = `TV-CMP-${Math.floor(10000 + Math.random() * 90000)}`;
    const newComplaint = {
      id: Date.now(),
      referenceId: randomRef,
      category: data.category || "General",
      subject: data.subject,
      description: data.description,
      relatedDocumentName: data.relatedDocumentName || "N/A",
      attachmentName: data.attachmentName || null,
      status: "Submitted",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          id: 1,
          author: "System Audit",
          message: `Complaint submitted with reference ID ${randomRef}. Assigned to Enterprise Support.`,
          timestamp: new Date().toISOString(),
          type: "system"
        }
      ]
    };
    MOCK_COMPLAINTS.unshift(newComplaint);
    return { success: true, complaint: newComplaint };
  }

  try {
    const res = await request("/api/support/complaints", {
      method: "POST",
      body: JSON.stringify(data)
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    const randomRef = `TV-CMP-${Math.floor(10000 + Math.random() * 90000)}`;
    const newComplaint = {
      id: Date.now(),
      referenceId: randomRef,
      category: data.category || "General",
      subject: data.subject,
      description: data.description,
      relatedDocumentName: data.relatedDocumentName || "N/A",
      attachmentName: data.attachmentName || null,
      status: "Submitted",
      createdAt: new Date().toISOString(),
      timeline: [
        {
          id: 1,
          author: "System Audit",
          message: `Complaint submitted with reference ID ${randomRef}.`,
          timestamp: new Date().toISOString(),
          type: "system"
        }
      ]
    };
    MOCK_COMPLAINTS.unshift(newComplaint);
    return { success: true, complaint: newComplaint };
  }
}

export async function apiGetMyComplaints() {
  if (isMockActive()) {
    return { complaints: [...MOCK_COMPLAINTS] };
  }
  try {
    const res = await request("/api/support/complaints", { method: "GET" });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    return { complaints: [...MOCK_COMPLAINTS] };
  }
}

export async function apiSubmitSecurityReport(data) {
  if (isMockActive()) {
    const randomRef = `TV-SEC-${Math.floor(10000 + Math.random() * 90000)}`;
    return {
      success: true,
      report: {
        id: Date.now(),
        referenceId: randomRef,
        incidentType: data.incidentType || "Suspicious Activity",
        subject: data.subject,
        status: "Escalated to SOC",
        createdAt: new Date().toISOString()
      }
    };
  }

  try {
    const res = await request("/api/support/security-report", {
      method: "POST",
      body: JSON.stringify(data)
    });
    return handleJsonResponse(res);
  } catch (_e) {
    if (!shouldFallbackToMock()) throw _e;
    const randomRef = `TV-SEC-${Math.floor(10000 + Math.random() * 90000)}`;
    return {
      success: true,
      report: {
        id: Date.now(),
        referenceId: randomRef,
        incidentType: data.incidentType || "Suspicious Activity",
        subject: data.subject,
        status: "Escalated to SOC",
        createdAt: new Date().toISOString()
      }
    };
  }
}

// --------------------------------------------------
// Profile Update Integration Boundary
// Contract Spec:
// PATCH /api/users/profile -> { user: { id, name, email, role } }
// POST  /api/users/avatar  -> { avatarUrl: string }
// --------------------------------------------------

export async function apiUpdateProfileName(name) {
  try {
    const res = await request("/api/users/profile", {
      method: "PATCH",
      body: JSON.stringify({ name })
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    return {
      success: true,
      user: { name },
      _boundaryNote: "PATCH /api/users/profile endpoint pending backend implementation"
    };
  }
}

// --------------------------------------------------
// Phase 4: Admin Dashboard & Unified Authentication APIs
// --------------------------------------------------

/**
 * Check whether an email is already registered and if it conflicts with requestedRole.
 * Enforces "One Email, One Account, One Role" policy.
 */
export async function apiCheckEmailRoleConflict(email, requestedRole) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) return { conflict: false };

  // Check known mock and session users
  const existingUser =
    adminUsersList.find((u) => u.email.toLowerCase() === normalized) ||
    Object.values(MOCK_USERS).find((u) => u.email.toLowerCase() === normalized);

  if (existingUser) {
    const existingRole = existingUser.role;
    const roleCapitalized = existingRole.charAt(0).toUpperCase() + existingRole.slice(1);

    return {
      conflict: true,
      existingRole,
      message: `This email is already registered as a${existingRole === "admin" || existingRole === "owner" ? "n" : ""} ${roleCapitalized} account. Each email can be associated with only one account type. Please sign in using your existing account.`
    };
  }

  return { conflict: false };
}

/**
 * Admin Overview Stats
 */
export async function apiGetAdminStats() {
  if (isMockActive()) {
    const totalAccounts = adminUsersList.length;
    const roleCounts = {
      admin: adminUsersList.filter((u) => u.role === "admin").length,
      owner: adminUsersList.filter((u) => u.role === "owner").length,
      viewer: adminUsersList.filter((u) => u.role === "viewer").length
    };
    return {
      stats: {
        ...MOCK_ADMIN_STATS,
        totalAccounts,
        roleCounts,
        pendingComplaintsCount: adminComplaintsList.filter(
          (c) => c.status === "Pending" || c.status === "In Review"
        ).length
      }
    };
  }

  try {
    const res = await request("/api/admin/stats", { method: "GET" });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    // Graceful offline fallback
    return {
      stats: {
        ...MOCK_ADMIN_STATS,
        totalAccounts: adminUsersList.length,
        roleCounts: {
          admin: adminUsersList.filter((u) => u.role === "admin").length,
          owner: adminUsersList.filter((u) => u.role === "owner").length,
          viewer: adminUsersList.filter((u) => u.role === "viewer").length
        }
      }
    };
  }
}

/**
 * Admin User & Role Management
 */
export async function apiGetAdminUsers(params = {}) {
  const { search = "", role = "", status = "" } = params;

  if (isMockActive()) {
    let filtered = [...adminUsersList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (role && role !== "all") {
      filtered = filtered.filter((u) => u.role.toLowerCase() === role.toLowerCase());
    }
    if (status && status !== "all") {
      filtered = filtered.filter(
        (u) => (u.status || "active").toLowerCase() === status.toLowerCase()
      );
    }
    return { users: filtered, total: filtered.length };
  }

  try {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (role) query.set("role", role);
    if (status) query.set("status", status);
    const res = await request(`/api/admin/users?${query.toString()}`, { method: "GET" });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    let filtered = [...adminUsersList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }
    if (role && role !== "all") {
      filtered = filtered.filter((u) => u.role.toLowerCase() === role.toLowerCase());
    }
    if (status && status !== "all") {
      filtered = filtered.filter(
        (u) => (u.status || "active").toLowerCase() === status.toLowerCase()
      );
    }
    return { users: filtered, total: filtered.length };
  }
}

/**
 * Admin Account Activation / Deactivation / Status Update
 */
export async function apiUpdateUserStatus(userId, { status, reason = "" }) {
  if (isMockActive()) {
    const userIdx = adminUsersList.findIndex((u) => u.id === userId);
    if (userIdx !== -1) {
      adminUsersList[userIdx] = { ...adminUsersList[userIdx], status };
    }
    return { success: true, userId, status, reason };
  }

  try {
    const res = await request(`/api/admin/users/${userId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, reason })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    const userIdx = adminUsersList.findIndex((u) => u.id === userId);
    if (userIdx !== -1) {
      adminUsersList[userIdx] = { ...adminUsersList[userIdx], status };
    }
    return {
      success: true,
      userId,
      status,
      reason,
      _boundaryNote: "PATCH /api/admin/users/:id/status pending backend integration"
    };
  }
}

/**
 * Admin Document Oversight
 */
export async function apiGetAdminDocuments(params = {}) {
  const { search = "", owner = "", category = "", from = "", to = "" } = params;

  if (isMockActive()) {
    let filtered = [...MOCK_DOCUMENTS];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((d) => d.name.toLowerCase().includes(q));
    }
    if (owner.trim()) {
      const q = owner.trim().toLowerCase();
      filtered = filtered.filter(
        (d) =>
          (d.owner_name && d.owner_name.toLowerCase().includes(q)) ||
          (d.owner_email && d.owner_email.toLowerCase().includes(q))
      );
    }
    if (category && category !== "all") {
      filtered = filtered.filter((d) => (d.category || "").toLowerCase() === category.toLowerCase());
    }
    return { documents: filtered, total: filtered.length };
  }

  try {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (owner) query.set("owner", owner);
    if (category) query.set("category", category);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    const res = await request(`/api/admin/documents?${query.toString()}`, { method: "GET" });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    let filtered = [...MOCK_DOCUMENTS];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((d) => d.name.toLowerCase().includes(q));
    }
    return { documents: filtered, total: filtered.length };
  }
}

/**
 * Admin Permissions Oversight
 */
export async function apiGetAdminPermissions() {
  if (isMockActive()) {
    return {
      permissions: MOCK_PERMISSIONS,
      history: [...adminPermissionHistory]
    };
  }

  try {
    const res = await request("/api/admin/permissions", { method: "GET" });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    return {
      permissions: MOCK_PERMISSIONS,
      history: [...adminPermissionHistory]
    };
  }
}

/**
 * Corrective Administrative Action on Permission
 */
export async function apiAdminCorrectPermission({ documentId, userId, action, reason }) {
  if (!reason || reason.trim().length < 5) {
    throw new Error("A valid administrative reason (minimum 5 characters) is required.");
  }

  if (isMockActive()) {
    const newEntry = {
      id: Date.now(),
      documentId,
      documentName: `Document #${documentId}`,
      targetUserEmail: `User #${userId}`,
      targetUserName: `User #${userId}`,
      permission: action === "revoke" ? "none" : "read",
      action: `admin_${action}`,
      changedByEmail: "admin@trustvault.internal",
      changedByName: "Admin",
      timestamp: new Date().toISOString(),
      reason
    };
    adminPermissionHistory.unshift(newEntry);
    return { success: true, historyEntry: newEntry };
  }

  try {
    const res = await request("/api/admin/permissions/correct", {
      method: "POST",
      body: JSON.stringify({ documentId, userId, action, reason })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    const newEntry = {
      id: Date.now(),
      documentId,
      documentName: `Document #${documentId}`,
      targetUserEmail: `User #${userId}`,
      targetUserName: `User #${userId}`,
      permission: action === "revoke" ? "none" : "read",
      action: `admin_${action}`,
      changedByEmail: "admin@trustvault.internal",
      changedByName: "Admin",
      timestamp: new Date().toISOString(),
      reason
    };
    adminPermissionHistory.unshift(newEntry);
    return {
      success: true,
      historyEntry: newEntry,
      _boundaryNote: "POST /api/admin/permissions/correct pending backend integration"
    };
  }
}

/**
 * Admin Complaint Inbox
 */
export async function apiGetAdminComplaints(params = {}) {
  const { search = "", category = "", status = "", priority = "" } = params;

  if (isMockActive()) {
    let filtered = [...adminComplaintsList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.referenceId.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.submitterName.toLowerCase().includes(q) ||
          c.submitterEmail.toLowerCase().includes(q)
      );
    }
    if (category && category !== "all") {
      filtered = filtered.filter((c) => (c.category || "").toLowerCase() === category.toLowerCase());
    }
    if (status && status !== "all") {
      filtered = filtered.filter((c) => (c.status || "").toLowerCase() === status.toLowerCase());
    }
    if (priority && priority !== "all") {
      filtered = filtered.filter((c) => (c.priority || "").toLowerCase() === priority.toLowerCase());
    }
    return { complaints: filtered, total: filtered.length };
  }

  try {
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (category) query.set("category", category);
    if (status) query.set("status", status);
    if (priority) query.set("priority", priority);
    const res = await request(`/api/admin/complaints?${query.toString()}`, { method: "GET" });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    let filtered = [...adminComplaintsList];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.referenceId.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.submitterName.toLowerCase().includes(q)
      );
    }
    return { complaints: filtered, total: filtered.length };
  }
}

/**
 * Update Complaint Status / Priority / Add Admin Response
 */
export async function apiUpdateComplaintStatus(
  complaintId,
  { status, priority, responseNote, emailNotified = false }
) {
  if (isMockActive()) {
    const idx = adminComplaintsList.findIndex((c) => c.id === complaintId);
    if (idx !== -1) {
      const complaint = adminComplaintsList[idx];
      const updatedTimeline = [...(complaint.timeline || [])];

      if (responseNote && responseNote.trim()) {
        updatedTimeline.push({
          id: Date.now(),
          author: "Admin Support",
          message: responseNote.trim(),
          timestamp: new Date().toISOString(),
          type: "admin",
          emailDispatched: emailNotified
        });
      }

      adminComplaintsList[idx] = {
        ...complaint,
        status: status || complaint.status,
        priority: priority || complaint.priority,
        timeline: updatedTimeline
      };
      return { success: true, complaint: adminComplaintsList[idx] };
    }
    return { success: true };
  }

  try {
    const res = await request(`/api/admin/complaints/${complaintId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, priority, responseNote, emailNotified })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    const idx = adminComplaintsList.findIndex((c) => c.id === complaintId);
    if (idx !== -1) {
      const complaint = adminComplaintsList[idx];
      const updatedTimeline = [...(complaint.timeline || [])];
      if (responseNote && responseNote.trim()) {
        updatedTimeline.push({
          id: Date.now(),
          author: "Admin Support",
          message: responseNote.trim(),
          timestamp: new Date().toISOString(),
          type: "admin",
          emailDispatched: emailNotified
        });
      }
      adminComplaintsList[idx] = {
        ...complaint,
        status: status || complaint.status,
        priority: priority || complaint.priority,
        timeline: updatedTimeline
      };
    }
    return {
      success: true,
      _boundaryNote: "PATCH /api/admin/complaints/:id pending backend integration"
    };
  }
}

/**
 * Forgot Password Request (Anti-enumeration policy)
 */
export async function apiForgotPassword({ email }) {
  const normalized = (email || "").trim().toLowerCase();
  if (!normalized) {
    throw new Error("Valid email address is required.");
  }

  if (isMockActive()) {
    return {
      success: true,
      message: "If an account exists for this email, password reset instructions will be sent."
    };
  }

  try {
    const res = await request("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: normalized })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    return {
      success: true,
      message: "If an account exists for this email, password reset instructions will be sent.",
      _boundaryNote: "POST /api/auth/forgot-password pending email service configuration"
    };
  }
}

/**
 * Validate Password Reset Token
 */
export async function apiValidateResetToken(token) {
  if (!token || token.trim().length === 0) {
    return { valid: false, error: "Missing or malformed password reset token." };
  }

  if (isMockActive()) {
    if (token === "expired-token") {
      return { valid: false, error: "This password reset link has expired. Please request a new one." };
    }
    if (token === "used-token") {
      return { valid: false, error: "This password reset token has already been used." };
    }
    return { valid: true, email: "user@trustvault.internal" };
  }

  try {
    const res = await request(
      `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
      { method: "GET" }
    );
    return handleJsonResponse(res);
  } catch (err) {
    return { valid: false, error: err.message || "Invalid or expired reset token." };
  }
}

/**
 * Submit New Password with Token
 */
export async function apiResetPassword({ token, newPassword }) {
  if (!token) throw new Error("Reset token is required.");
  if (!newPassword || newPassword.length < 12) {
    throw new Error("Password must be at least 12 characters in length.");
  }

  if (isMockActive()) {
    if (token === "expired-token" || token === "used-token") {
      throw new Error("Reset token is no longer valid or has expired.");
    }
    return {
      success: true,
      message: "Password updated successfully. You can now log in with your new credentials."
    };
  }

  try {
    const res = await request("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, newPassword })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    if (!shouldFallbackToMock()) throw _err;
    return {
      success: true,
      message: "Password updated successfully. You can now log in with your new credentials.",
      _boundaryNote: "POST /api/auth/reset-password pending backend implementation"
    };
  }
}

/**
 * Google Sign-In Integration Boundary
 */
export async function apiGoogleAuth({ idToken, role }) {
  try {
    const res = await request("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken, role })
    });
    return handleJsonResponse(res);
  } catch (_err) {
    throw new Error(
      "Google OAuth integration boundary: Backend endpoint /api/auth/google or VITE_GOOGLE_CLIENT_ID is not configured. Google Sign-In requires server-side identity token verification and client credentials."
    );
  }
}

// --------------------------------------------------
// Mobile OTP API (MSG91 Integration)
// --------------------------------------------------

/**
 * Request an OTP dispatch to the given mobile number.
 */
export async function apiSendMobileOtp({ mobile }) {
  if (!mobile || !mobile.trim()) {
    throw new Error("Mobile number is required.");
  }

  if (isMockActive()) {
    return {
      success: true,
      message: "OTP sent successfully to your mobile number.",
      normalizedMobile: mobile.replace(/\D/g, "")
    };
  }

  try {
    const res = await request("/api/auth/otp/send", {
      method: "POST",
      body: JSON.stringify({ mobile })
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    return {
      success: true,
      message: "OTP sent successfully to your mobile number (mock fallback).",
      normalizedMobile: mobile.replace(/\D/g, "")
    };
  }
}

/**
 * Verify a 6-digit OTP code against MSG91.
 */
export async function apiVerifyMobileOtp({ mobile, otp }) {
  if (!mobile || !mobile.trim()) {
    throw new Error("Mobile number is required.");
  }
  if (!otp || !/^\d{6}$/.test(otp.trim())) {
    throw new Error("A valid 6-digit OTP is required.");
  }

  if (isMockActive()) {
    if (otp === "000000") {
      const err = new Error("Invalid or expired OTP. Please check the code and try again.");
      err.status = 400;
      err.data = { remainingAttempts: 4 };
      throw err;
    }
    return {
      success: true,
      message: "Mobile number verified successfully.",
      phone_verified: true
    };
  }

  try {
    const res = await request("/api/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ mobile, otp: otp.trim() })
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    return {
      success: true,
      message: "Mobile number verified successfully (mock fallback).",
      phone_verified: true
    };
  }
}

/**
 * Retry/resend OTP via SMS or Voice.
 */
export async function apiRetryMobileOtp({ mobile, retryType = "text" }) {
  if (!mobile || !mobile.trim()) {
    throw new Error("Mobile number is required.");
  }

  if (isMockActive()) {
    return {
      success: true,
      message: `OTP resent successfully via ${retryType}.`
    };
  }

  try {
    const res = await request("/api/auth/otp/retry", {
      method: "POST",
      body: JSON.stringify({ mobile, retryType })
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    return {
      success: true,
      message: `OTP resent successfully via ${retryType} (mock fallback).`
    };
  }
}

/**
 * Get current mobile OTP verification status for authenticated user.
 */
export async function apiGetMobileOtpStatus() {
  if (isMockActive()) {
    return {
      configured: true,
      phone_verified: false,
      phone: null
    };
  }

  try {
    const res = await request("/api/auth/otp/status", {
      method: "GET"
    });
    return handleJsonResponse(res);
  } catch (err) {
    if (!shouldFallbackToMock()) throw err;
    return {
      configured: false,
      phone_verified: false,
      phone: null
    };
  }
}

// --------------------------------------------------
// Admin Secret Key Management APIs
// --------------------------------------------------

export const MOCK_ADMIN_KEYS = [
  {
    id: "KEY-DEFAULT-01",
    name: "TrustVault Root Master Key",
    algorithm: "AES-256-GCM",
    status: "active",
    scope: "document",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    rotated_at: null,
    revoked_at: null,
    created_by_name: "Admin Administrator",
    created_by_email: "Admin@trustvault.com",
    document_count: 5
  }
];

export async function apiGetAdminKeys() {
  if (isMockActive()) {
    const keys = [...MOCK_ADMIN_KEYS];
    const stats = {
      totalKeys: keys.length,
      activeKeys: keys.filter((k) => k.status === "active").length,
      rotatedKeys: keys.filter((k) => k.status === "rotated").length,
      revokedKeys: keys.filter((k) => k.status === "revoked").length,
      protectedDocuments: keys.reduce((sum, k) => sum + (k.document_count || 0), 0)
    };
    return { keys, auditEvents: [], stats };
  }

  const res = await request("/api/admin/keys", { method: "GET" });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to load encryption keys");
  }
  return res.json();
}

export async function apiGetAdminKeyDetails(keyId) {
  if (isMockActive()) {
    const key = MOCK_ADMIN_KEYS.find((k) => k.id === keyId) || MOCK_ADMIN_KEYS[0];
    return { key, documents: MOCK_DOCUMENTS.slice(0, 3) };
  }

  const res = await request(`/api/admin/keys/${keyId}`, { method: "GET" });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to load key details");
  }
  return res.json();
}

export async function apiGenerateAdminKey({ name, scope = "document" }) {
  if (isMockActive()) {
    const newKey = {
      id: `KEY-${Date.now().toString(36).toUpperCase()}`,
      name,
      algorithm: "AES-256-GCM",
      status: "active",
      scope,
      created_at: new Date().toISOString(),
      created_by_name: "Admin Administrator",
      created_by_email: "Admin@trustvault.com",
      document_count: 0
    };
    MOCK_ADMIN_KEYS.unshift(newKey);
    return { message: "Key generated successfully", key: newKey };
  }

  const res = await request("/api/admin/keys/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, scope, confirm: true })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to generate encryption key");
  }
  return res.json();
}

export async function apiRotateAdminKey(keyId, options = {}) {
  if (isMockActive()) {
    const oldKey = MOCK_ADMIN_KEYS.find((k) => k.id === keyId);
    if (oldKey) {
      oldKey.status = "rotated";
      oldKey.rotated_at = new Date().toISOString();
    }
    const newKey = {
      id: `KEY-${Date.now().toString(36).toUpperCase()}`,
      name: `${oldKey?.name || "Key"} (Rotated)`,
      algorithm: "AES-256-GCM",
      status: "active",
      scope: oldKey?.scope || "document",
      created_at: new Date().toISOString(),
      document_count: oldKey?.document_count || 0
    };
    MOCK_ADMIN_KEYS.unshift(newKey);
    return { message: "Key rotated successfully", oldKeyId: keyId, newKeyId: newKey.id, rewrappedCount: 1 };
  }

  const res = await request(`/api/admin/keys/${keyId}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true, ...options })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to rotate encryption key");
  }
  return res.json();
}

export async function apiRevokeAdminKey(keyId, reason = "") {
  if (isMockActive()) {
    const key = MOCK_ADMIN_KEYS.find((k) => k.id === keyId);
    if (key) {
      key.status = "revoked";
      key.revoked_at = new Date().toISOString();
    }
    return { message: "Key revoked successfully", key };
  }

  const res = await request(`/api/admin/keys/${keyId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true, reason })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to revoke encryption key");
  }
  return res.json();
}

export async function apiGrantDocumentAccess(documentId, viewerId, permission = "read") {
  const res = await request(`/api/documents/${documentId}/access`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ viewerId, permission })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to grant document access");
  }
  return res.json();
}

export async function apiRevokeDocumentAccess(documentId, viewerId) {
  const res = await request(`/api/documents/${documentId}/access/${viewerId}`, {
    method: "DELETE"
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error || "Failed to revoke document access");
  }
  return res.json();
}




