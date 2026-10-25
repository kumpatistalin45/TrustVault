# TrustVault — Threat Model & Security Assessment

This document provides a comprehensive STRIDE-based threat model, risk evaluation, defensive architectural analysis, and verification matrix for the **TrustVault** platform.

---

## 1. Assets, Trust Boundaries & Attack Surfaces

### Critical Assets
1. **Plaintext Document Content**: Sensitive enterprise documents (PDF, DOCX, images, source code, financial reports).
2. **Cryptographic Key Material**: `FILE_ENCRYPTION_KEY`, session secrets, and CSRF secrets.
3. **User Authentication Credentials**: Passwords (hashed via bcrypt), active session IDs (`trustvault.sid`).
4. **Audit Log Integrity**: Append-only activity records proving non-repudiation and detecting intrusion.
5. **Database Metadata & ACLs**: Document permission records defining authorization boundaries.

### Trust Boundaries
```
[ Untrusted Internet / Client ]
             |
=== [ Trust Boundary 1: TLS / CORS / Reverse Proxy / Rate Limiter ] ===
             |
    [ Express Application Server ]
        |                 |
=== [ Trust Boundary 2 ] === [ Trust Boundary 3 ] ===
        |                            |
  [ PostgreSQL Database ]     [ Encrypted Storage (backend/storage/) ]
  (Sessions, ACLs, Audits)    (AES-256-GCM Ciphertext Envelopes)
```

- **Trust Boundary 1 (Client to Application Server)**: All incoming HTTP requests, headers, cookies, and multipart upload streams are treated as untrusted.
- **Trust Boundary 2 (Application Server to Database)**: Controlled via parameterized queries and transactional row-level locking.
- **Trust Boundary 3 (Application Server to Storage Subsystem)**: Files stored on disk are strictly encrypted; the filesystem does not possess decryption keys.

### Attack Surfaces
- Public Authentication Endpoints (`/api/auth/*`).
- File Upload Multipart Processing (`/api/documents`).
- Download Streaming Endpoints (`/api/documents/:id/download`).
- Per-Document ACL Management (`/api/documents/:id/permissions`).
- Query Search & Date Filtering (`/api/documents`).
- Centralized Admin Audit Log Portal (`/api/admin/audit-logs`).

---

## 2. Threat Actors & Threat Scenarios

| Threat Actor | Motivation | Capabilities | Primary Threat Scenarios |
|---|---|---|---|
| **Malicious Anonymous Attacker** | Data theft, extortion, service disruption | Web automation, brute force, automated scanners | Credential stuffing, CSRF, SQL injection, path traversal, payload exhaustion |
| **Unauthorized Authenticated User (Viewer / Rogue User)** | Privilege escalation, competitive intelligence | Valid account, API manipulation, parameter tampering | Insecure Direct Object Reference (IDOR), unauthorized file upload, race conditions |
| **Malicious Document Editor** | Exceed granted privileges, sabotage | Legitimate edit permission on shared document | Attempting document deletion, attempting permission reassignment, malware injection |
| **Compromised Storage / Malicious Insider** | Data harvesting, evidence tampering | Direct read/write access to `storage/` directory | Offline ciphertext tampering, bit-flipping, file replacement |

---

## 3. Threat Analysis & Mitigations

### 3.1 Authentication & Account Enumeration
- **Threat**: Attackers use timing differences in credential verification or distinct error messages to identify valid user accounts.
- **Mitigation in Code**:
  - `bcrypt.compare` uses a persistent `dummyHashPromise` when an email is not found, ensuring uniform computation time for existent and nonexistent accounts.
  - Returns identical error message: `"Invalid email or password"`.
  - Registration and login routes are protected by IP-based rate limiters (`express-rate-limit`).

### 3.2 Session Fixation, Hijacking & Invalidation
- **Threat**: An attacker pre-establishes a session ID or intercepts an active session cookie to impersonate a legitimate user.
- **Mitigation in Code**:
  - `req.session.regenerate()` is executed upon successful login, allocating a brand-new session ID.
  - Sessions are persisted server-side in PostgreSQL `user_sessions`.
  - Cookie flags: `HttpOnly = true` (blocks XSS exfiltration), `SameSite = Lax` (blocks cross-site transmission), `Secure = true` in production (prevents cleartext sniffing), and a 15-minute sliding TTL (`maxAge: 15 * 60 * 1000`, `rolling: true`).
  - `/api/auth/logout` explicitly destroys the database session row and clears client cookies.

### 3.3 Cross-Site Request Forgery (CSRF)
- **Threat**: A victim visits a malicious webpage that triggers state-changing actions (upload, grant permissions, delete document) against TrustVault.
- **Mitigation in Code**:
  - Double-submit HMAC CSRF defense via `csrf-csrf`.
  - CSRF cookie is `HttpOnly`, preventing JavaScript tampering.
  - The CSRF secret is tied to `req.sessionID`.
  - State-changing methods (`POST`, `PATCH`, `DELETE`) require the `X-CSRF-Token` header.
  - Login refreshes and rebinds the CSRF token to the new session ID.

### 3.4 Insecure Direct Object References (IDOR) & Broken Object-Level Authorization
- **Threat**: An attacker alters the document ID in `/api/documents/:id` or `/api/documents/:id/download` to access private files belonging to other users.
- **Mitigation in Code**:
  - Every document operation executes strict server-side ownership and ACL checks against PostgreSQL.
  - SQL queries explicitly verify `(d.owner_id = $userId OR dp.user_id = $userId)`.
  - Inaccessible or nonexistent documents return uniform `404 Not Found` responses, eliminating resource existence leakage.

### 3.5 Race Conditions & Time-of-Check to Time-of-Use (TOCTOU)
- **Threat**: An attacker whose edit permission is being revoked submits metadata updates concurrently to exploit window gaps between permission validation and database write.
- **Mitigation in Code**:
  - `PATCH /api/documents/:id` executes an atomic SQL `UPDATE` statement that locks the row and evaluates `(owner_id = $userId OR EXISTS (SELECT 1 FROM document_permissions WHERE document_id = $id AND user_id = $userId AND permission = 'edit'))` within the same database transaction.
  - Permission grant and revoke operations start with `BEGIN` and acquire row-level locks via `SELECT ... FOR UPDATE`.

### 3.6 SQL Injection (SQLi)
- **Threat**: Attackers inject SQL syntax via search filters, email parameters, or IDs to bypass authentication or extract sensitive database tables.
- **Mitigation in Code**:
  - 100% parameterized queries using PostgreSQL `$1`, `$2` parameter placeholders. Zero string concatenation in query construction.
  - LIKE query wildcards (`%`, `_`, `\`) are systematically escaped.
  - Primary and foreign keys are validated as positive safe integers (`validDocumentId`, `validUserId`).

### 3.7 Path Traversal & Unsafe Storage Keys
- **Threat**: Uploading filenames like `../../../../etc/passwd` or craftily manipulated storage keys to read or overwrite arbitrary filesystem files.
- **Mitigation in Code**:
  - `sanitizeFilename()` normalizes path separators, extracts `path.basename()`, strips control characters, and rejects traversal artifacts (`.` and `..`).
  - Storage keys are generated server-side using CSPRNG (`crypto.randomBytes(32).toString('hex')`) and validated against strict 64-character hex regex (`/^[a-f0-9]{64}$/`).
  - Storage paths are validated to ensure `path.dirname(filePath) === STORAGE_DIR`.

### 3.8 Cryptographic Weaknesses & Ciphertext Tampering
- **Threat**: Replay attacks, bit-flipping of ciphertext, padding oracle attacks, or key derivation leakage.
- **Mitigation in Code**:
  - AES-256-GCM authenticated encryption mode.
  - Cryptographically fresh 12-byte IV for every document; IV is never reused.
  - 16-byte GCM authentication tag verifies ciphertext integrity. Any modified byte fails tag verification and triggers immediate failure.
  - Plaintext length is verified against recorded database `size_bytes`.
  - Decryption failures immediately halt and return `500 File integrity verification failed` without returning partial plaintext.

### 3.9 Upload Execution & Malicious Content Sniffing
- **Threat**: Uploading active HTML, SVG, or executable scripts to achieve Stored XSS or Remote Code Execution.
- **Mitigation in Code**:
  - Uploaded files are envelope-encrypted before being written to disk; no executable content exists on the host filesystem.
  - Stored files are located outside public web directories.
  - Client MIME types are verified against binary magic bytes for common formats (PDF, PNG, JPEG, GIF, ZIP).
  - Downloads enforce `Content-Type: application/octet-stream`, `X-Content-Type-Options: nosniff`, and `Content-Disposition: attachment`. Browsers are instructed to download rather than render.

### 3.10 Denial of Service (DoS)
- **Threat**: Flooding server memory with massive files or excessive registration/login requests.
- **Mitigation in Code**:
  - Multer limits: `fileSize = 10 MB`, `files = 1`, `fields = 10`, `parts = 12`.
  - Express body limits: `16 KB` limit on JSON and URL-encoded bodies.
  - Rate limiting: 10 login attempts per 15 minutes, 10 registrations per hour.
  - Database pool connection timeouts (`connectionTimeoutMillis: 5000`) and statement limits.

### 3.11 Audit Log Manipulation & Secret Leakage
- **Threat**: Attackers alter activity history to conceal intrusion or harvest leaked passwords/tokens from log files.
- **Mitigation in Code**:
  - Audit logs are append-only; no endpoint allows modification or deletion of `audit_logs` entries.
  - Audit logging is transactionally committed alongside critical operations (`db: client`).
  - Password strings, session IDs, CSRF tokens, and encryption keys are strictly excluded from audit details JSON.

---

## 4. Residual Risks & Security Limitations

1. **Host-Level Storage Key Compromise**:
   - *Risk*: An attacker with root shell access on the application server could extract `FILE_ENCRYPTION_KEY` from process environment memory.
   - *Recommendation*: Integrate a dedicated Hardware Security Module (HSM) or cloud KMS (AWS KMS, GCP Cloud KMS, HashiCorp Vault) for envelope key encryption.
2. **Database Superuser Audit Tampering**:
   - *Risk*: A rogue database administrator possessing superuser credentials could modify rows in `audit_logs`.
   - *Recommendation*: Stream audit logs asynchronously to an external immutable WORM (Write Once, Read Many) log service (e.g. AWS CloudWatch / S3 Glacier with Object Lock).
3. **Advanced Steganography & Binary Malware**:
   - *Risk*: An uploaded PDF or Office document could contain malicious embedded macros.
   - *Recommendation*: Implement an asynchronous antivirus pipeline (e.g. ClamAV sandbox container) prior to release.

---

## 5. Security Testing Evidence

Automated regression and security tests in `backend/tests/` verify our threat mitigations:

| Threat Category | Test File | Verified Scenarios |
|---|---|---|
| **Authentication & Brute Force** | `auth.test.js` | Password length enforcement, duplicate rejection, rate limiting (429) |
| **Session & Fixation** | `auth.test.js` | Session ID regeneration on login, session invalidation on logout |
| **CSRF Lifecycle** | `auth.test.js` | Block missing token (403), block invalid token (403), permit valid token |
| **SQL Injection** | `documents.test.js` | Injection payloads (`' OR '1'='1' --`) rejected safely |
| **IDOR & Authorization** | `security.test.js` | Cross-user document isolation, unauthorized read/write/share blocked (404) |
| **Roles & Privileges** | `security.test.js` | Viewer upload blocked (403), non-admin audit log blocked (403) |
| **Path Traversal** | `security.test.js` | Filename sanitization (`../../etc/passwd` -> `passwd`), dot rejection |
| **Tamper Detection** | `documents.test.js` | Modified ciphertext rejected (500) via GCM auth tag failure |
| **Data Integrity Cleanup** | `security.test.js` | Deletion purges database records, cascaded permissions, and encrypted disk files |
| **Secret Omission** | `security.test.js` | Audit log details verified free of passwords, keys, and tokens |
