"use strict";

const crypto = require("crypto");
const bcrypt = require("bcrypt");

/**
 * Validates corporate email format
 */
function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 255) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validates phone/mobile format
 */
function isValidPhone(phone) {
  if (!phone) return true;
  if (typeof phone !== "string") return false;
  let trimmed = phone.trim();
  if (trimmed.startsWith("'")) {
    trimmed = trimmed.slice(1);
  }
  if (!trimmed) return true;
  return /^[\d\s+\-().]{7,25}$/.test(trimmed);
}

/**
 * Sanitizes spreadsheet formula injection (CSV injection defense)
 * Strips or prefixes leading =, +, -, @, tab, or carriage return characters.
 * Exempts international phone numbers starting with + followed by digits.
 */
function sanitizeFormulaInjection(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  // If it's a standard international phone number (+1..., +44...), keep as phone number
  if (/^\+[\d\s\-().]{7,25}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[=+\-@\t\r]/.test(trimmed)) {
    // Prefix with single quote to force spreadsheet programs to treat as text
    return "'" + trimmed;
  }
  return trimmed;
}

/**
 * Robust RFC 4180 compliant CSV parser
 */
function parseCsv(text) {
  if (!text || typeof text !== "string" || !text.trim()) {
    return [];
  }

  // Normalize line endings
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const filteredLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (filteredLines.length === 0) return [];

  // Parse header line
  const headers = parseCsvLine(filteredLines[0]).map((h) =>
    h
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/^_+|_+$/g, "")
  );

  const rows = [];
  for (let i = 1; i < filteredLines.length; i++) {
    const rawTokens = parseCsvLine(filteredLines[i]);
    if (rawTokens.every((t) => !t.trim())) continue;

    const rowObj = { _rowNum: i + 1 };
    headers.forEach((header, colIdx) => {
      const val = rawTokens[colIdx] !== undefined ? rawTokens[colIdx].trim() : "";
      rowObj[header] = sanitizeFormulaInjection(val);
    });

    normalizeRowAliases(rowObj);
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Parses a single CSV line respecting quotes and escaped quotes
 */
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuote = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (insideQuote && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === "," && !insideQuote) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Normalizes common CSV column headers
 */
function normalizeRowAliases(row) {
  // Name
  if (!row.name) {
    row.name = row.full_name || row.owner_name || row.viewer_name || row.user_name || "";
  }
  // Email
  if (!row.email) {
    row.email = row.corporate_email || row.email_address || row.email_id || "";
  }
  // Mobile
  if (!row.mobile) {
    row.mobile = row.phone || row.contact || row.mobile_number || row.phone_number || "";
  }
  // Department
  if (!row.department) {
    row.department = row.dept || row.organization || row.division || "General Operations";
  }
  // Status
  if (!row.status) {
    row.status = "active";
  } else {
    const s = row.status.toLowerCase();
    row.status = s.includes("inactive")
      ? "inactive"
      : s.includes("pending")
      ? "pending"
      : s.includes("suspend")
      ? "suspended"
      : "active";
  }
  // Approval state
  if (!row.approval_state) {
    row.approval_state = row.status === "pending" ? "pending" : "approved";
  }
  // Access state
  if (!row.access_state) {
    row.access_state =
      row.status === "suspended"
        ? "revoked"
        : row.status === "inactive"
        ? "restricted"
        : "granted";
  }
}

/**
 * Generates formatted unique user ID
 */
function generateUniqueId(role, id) {
  const prefix = role === "owner" ? "TV-OWN" : role === "viewer" ? "TV-VIW" : "TV-ADM";
  return `${prefix}-${String(id).padStart(4, "0")}`;
}

module.exports = {
  isValidEmail,
  isValidPhone,
  sanitizeFormulaInjection,
  parseCsv,
  normalizeRowAliases,
  generateUniqueId
};
