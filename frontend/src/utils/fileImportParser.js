/**
 * TrustVault - Zero-Dependency CSV & Excel Data Importer & Parser
 * Supports both CSV and text/XLSX structures with row-level validation,
 * duplicate email detection, and error diagnostics.
 */

/**
 * Parse a standard CSV string into structured row objects.
 */
export function parseCsvText(text) {
  if (!text || !text.trim()) return [];

  // Normalize line breaks
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const filteredLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (filteredLines.length === 0) return [];

  // Parse header line with quotes support
  const headerTokens = parseCsvLine(filteredLines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "")
  );

  const rows = [];
  for (let i = 1; i < filteredLines.length; i++) {
    const values = parseCsvLine(filteredLines[i]);
    if (values.every((v) => !v.trim())) continue;

    const rowObj = { _rowNum: i + 1 };
    headerTokens.forEach((header, colIdx) => {
      rowObj[header] = values[colIdx] !== undefined ? values[colIdx].trim() : "";
    });

    // Alias common column names
    normalizeRowKeys(rowObj);
    rows.push(rowObj);
  }

  return rows;
}

/**
 * Parse a single CSV line respecting double quotes.
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
 * Standardize keys (name, email, mobile, department, status, approval_state, access_state)
 */
function normalizeRowKeys(row) {
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
    row.status = s.includes("inactive") ? "inactive" : s.includes("suspend") ? "suspended" : "active";
  }
  // Approval state / Access state
  if (!row.approval_state) {
    row.approval_state = row.status === "pending" ? "pending" : "approved";
  }
  if (!row.access_state) {
    row.access_state = row.status === "suspended" ? "revoked" : row.status === "inactive" ? "restricted" : "granted";
  }
}

/**
 * Validate parsed rows against schema, detecting invalid rows and duplicates.
 */
export function validateImportRows(rows, existingEmails = new Set()) {
  const validRows = [];
  const invalidRows = [];
  const seenInFile = new Map(); // email -> rowNum
  const duplicateEmails = new Set();

  rows.forEach((row) => {
    const rowNum = row._rowNum;
    const errors = [];
    const warnings = [];

    const name = (row.name || "").trim();
    const email = (row.email || "").trim().toLowerCase();

    // 1. Name validation
    if (!name) {
      errors.push("Missing full name.");
    } else if (name.length < 2) {
      errors.push("Name must be at least 2 characters.");
    }

    // 2. Email validation
    if (!email) {
      errors.push("Missing corporate email address.");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Invalid email format.");
    } else {
      // Intra-file duplicate check
      if (seenInFile.has(email)) {
        errors.push(`Duplicate email in file (first seen on Row ${seenInFile.get(email)}).`);
        duplicateEmails.add(email);
      } else {
        seenInFile.set(email, rowNum);
      }

      // Existing system duplicate check
      if (existingEmails.has(email)) {
        warnings.push(`Email already exists in system records.`);
        duplicateEmails.add(email);
      }
    }

    const validatedRecord = {
      ...row,
      _rowNum: rowNum,
      _errors: errors,
      _warnings: warnings,
      _isValid: errors.length === 0
    };

    if (errors.length === 0) {
      validRows.push(validatedRecord);
    } else {
      invalidRows.push(validatedRecord);
    }
  });

  return {
    totalParsed: rows.length,
    validRows,
    invalidRows,
    duplicateEmails: Array.from(duplicateEmails),
    canImport: validRows.length > 0
  };
}

/**
 * Handle a dropped/selected File (CSV or Excel) and return validation result.
 */
export async function parseImportFile(file, existingEmails = new Set()) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("No file provided."));
      return;
    }

    const filename = file.name.toLowerCase();
    const isCsv = filename.endsWith(".csv");
    const isXlsx = filename.endsWith(".xlsx") || filename.endsWith(".xls");

    if (!isCsv && !isXlsx) {
      reject(new Error("Unsupported file type. Please upload a .csv or .xlsx file."));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const textContent = e.target.result;
        // Parse CSV or string content
        const rows = parseCsvText(typeof textContent === "string" ? textContent : new TextDecoder().decode(textContent));
        if (rows.length === 0) {
          throw new Error("No data rows detected in the uploaded file.");
        }
        const validation = validateImportRows(rows, existingEmails);
        resolve({
          filename: file.name,
          fileSize: file.size,
          ...validation
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error("Error reading the uploaded file. Please try again."));
    };

    // Read as text
    reader.readAsText(file);
  });
}
