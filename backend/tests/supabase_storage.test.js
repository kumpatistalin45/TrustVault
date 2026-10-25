const request = require("supertest");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const app = require("../server");
const pool = require("../db");
const {
  saveEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  getStorageProvider,
  validateStorageConfig,
  STORAGE_DIR,
  storagePathForKey,
  _setSupabaseClientForTesting,
  _resetStorageForTesting
} = require("../storageService");
const { encryptBuffer, decryptBuffer } = require("../encryption");

describe("Supabase Storage Cloud Integration & Security Suite", () => {
  const originalEnv = { ...process.env };
  const createdDocIds = new Set();
  const createdUserIds = new Set();
  const createdStorageKeys = new Set();

  beforeEach(() => {
    process.env = { ...originalEnv };
    _resetStorageForTesting();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    _resetStorageForTesting();

    for (const docId of createdDocIds) {
      await pool.query("DELETE FROM document_permissions WHERE document_id = $1", [docId]).catch(() => {});
      await pool.query("DELETE FROM documents WHERE id = $1", [docId]).catch(() => {});
    }
    for (const userId of createdUserIds) {
      await pool.query("DELETE FROM user_sessions WHERE sess::jsonb->'user'->>'id' = $1", [String(userId)]).catch(() => {});
      await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => {});
    }
    for (const key of createdStorageKeys) {
      const localPath = path.resolve(STORAGE_DIR, key);
      try {
        await fsp.unlink(localPath);
      } catch (_e) {}
    }
  });

  describe("1. Provider Configuration & Strict Validation", () => {
    it("defaults to local storage when STORAGE_PROVIDER and Supabase variables are absent", () => {
      delete process.env.STORAGE_PROVIDER;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(getStorageProvider()).toBe("local");
    });

    it("selects supabase when STORAGE_PROVIDER=supabase", () => {
      process.env.STORAGE_PROVIDER = "supabase";
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-32-chars-long";

      expect(getStorageProvider()).toBe("supabase");
    });

    it("throws a clear error when STORAGE_PROVIDER=supabase but credentials are missing (no silent local fallback)", () => {
      process.env.STORAGE_PROVIDER = "supabase";
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => validateStorageConfig(false)).toThrow(
        /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.*must be specified/i
      );
    });

    it("throws a clear error when SUPABASE_URL is not a valid HTTP/HTTPS URL", () => {
      process.env.STORAGE_PROVIDER = "supabase";
      process.env.SUPABASE_URL = "invalid-url-format";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key-32-chars-long";

      expect(() => validateStorageConfig(false)).toThrow(
        /SUPABASE_URL must be a valid HTTP\/HTTPS URL/i
      );
    });

    it("throws in production if STORAGE_PROVIDER=supabase is requested without credentials", () => {
      process.env.STORAGE_PROVIDER = "supabase";
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => validateStorageConfig(true)).toThrow(
        /Supabase Storage configuration error/i
      );
    });
  });

  describe("2. Supabase Storage Adapter Operations (Mock Client)", () => {
    let mockStorageFiles;
    let mockSupabaseClient;

    beforeEach(() => {
      mockStorageFiles = new Map();

      mockSupabaseClient = {
        storage: {
          from: (bucket) => ({
            upload: jest.fn(async (path, buffer, options) => {
              mockStorageFiles.set(path, {
                buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
                options,
                bucket
              });
              return { data: { path }, error: null };
            }),
            download: jest.fn(async (path) => {
              if (!mockStorageFiles.has(path)) {
                return {
                  data: null,
                  error: { message: `Object not found: ${path}`, statusCode: 404, status: 404 }
                };
              }
              const item = mockStorageFiles.get(path);
              return {
                data: {
                  arrayBuffer: async () => item.buffer.buffer.slice(
                    item.buffer.byteOffset,
                    item.buffer.byteOffset + item.buffer.byteLength
                  )
                },
                error: null
              };
            }),
            remove: jest.fn(async (paths) => {
              paths.forEach((p) => mockStorageFiles.delete(p));
              return { data: paths.map((p) => ({ name: p })), error: null };
            })
          })
        }
      };

      _setSupabaseClientForTesting(mockSupabaseClient, "supabase", "trustvault-documents");
    });

    it("uploads AES-256-GCM encrypted envelope to Supabase Storage with binary content-type and zero-cache", async () => {
      const key = crypto.randomBytes(32).toString("hex");
      const envelope = Buffer.from("TVE1_SUPABASE_CIPHERTEXT_PAYLOAD");

      await saveEncryptedFile(key, envelope);

      expect(mockStorageFiles.has(key)).toBe(true);
      const stored = mockStorageFiles.get(key);
      expect(stored.bucket).toBe("trustvault-documents");
      expect(stored.buffer.equals(envelope)).toBe(true);
      expect(stored.options.contentType).toBe("application/octet-stream");
      expect(stored.options.cacheControl).toContain("no-store");
      expect(stored.options.upsert).toBe(false);
    });

    it("retrieves and returns encrypted envelope buffer from Supabase Storage", async () => {
      const key = crypto.randomBytes(32).toString("hex");
      const envelope = Buffer.from("TVE1_RETRIEVAL_TEST_BUFFER");
      mockStorageFiles.set(key, { buffer: envelope });

      const retrieved = await readEncryptedFile(key);

      expect(Buffer.isBuffer(retrieved)).toBe(true);
      expect(retrieved.equals(envelope)).toBe(true);
    });

    it("preserves backward compatibility: falls back to local storage if file exists locally but not in cloud", async () => {
      const key = crypto.randomBytes(32).toString("hex");
      createdStorageKeys.add(key);
      const legacyLocalCiphertext = Buffer.from("TVE1_LEGACY_LOCAL_CIPHERTEXT");
      const localPath = path.resolve(STORAGE_DIR, key);

      // Write directly to local disk simulating pre-existing document
      await fsp.writeFile(localPath, legacyLocalCiphertext, { flag: "wx", mode: 0o600 });

      // Ensure key is NOT in Supabase mock
      expect(mockStorageFiles.has(key)).toBe(false);

      // readEncryptedFile must detect missing cloud object and safely return pre-existing local copy
      const retrieved = await readEncryptedFile(key);
      expect(retrieved.equals(legacyLocalCiphertext)).toBe(true);
    });

    it("throws normalized 404/ENOENT error when document is absent from both Supabase Storage and local disk", async () => {
      const missingKey = crypto.randomBytes(32).toString("hex");

      await expect(readEncryptedFile(missingKey)).rejects.toMatchObject({
        code: "ENOENT",
        status: 404
      });
    });

    it("deletes encrypted envelope from Supabase Storage and cleans up local copy if present", async () => {
      const key = crypto.randomBytes(32).toString("hex");
      createdStorageKeys.add(key);

      mockStorageFiles.set(key, { buffer: Buffer.from("CIPHER") });
      const localPath = path.resolve(STORAGE_DIR, key);
      await fsp.writeFile(localPath, Buffer.from("LOCAL_CIPHER"), { flag: "w" });

      await deleteEncryptedFile(key);

      expect(mockStorageFiles.has(key)).toBe(false);
      expect(fs.existsSync(localPath)).toBe(false);
    });
  });

  describe("3. End-to-End API Integration with Supabase Storage Active", () => {
    let mockStorageFiles;
    let mockSupabaseClient;
    let ownerAgent;
    let outsiderAgent;
    let viewerAgent;
    let suspendedViewerAgent;

    let ownerUser;
    let outsiderUser;
    let viewerUser;
    let suspendedViewer;

    let csrfToken;

    async function getCsrfToken(agent) {
      const res = await agent.get("/api/auth/csrf-token");
      expect(res.status).toBe(200);
      return res.body.csrfToken;
    }

    beforeAll(async () => {
      // Setup agents
      ownerAgent = request.agent(app);
      outsiderAgent = request.agent(app);
      viewerAgent = request.agent(app);
      suspendedViewerAgent = request.agent(app);

      const hash = await bcrypt.hash("TrustVaultSupabase2026!", 10);
      const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      // Owner A
      const oRes = await pool.query(
        "INSERT INTO users (name, email, password_hash, role, status) VALUES ('Owner A', $1, $2, 'owner', 'active') RETURNING id, email",
        [`sb-owner-${unique}@trustvault.internal`, hash]
      );
      ownerUser = oRes.rows[0];
      createdUserIds.add(ownerUser.id);

      // Owner B (Outsider)
      const outRes = await pool.query(
        "INSERT INTO users (name, email, password_hash, role, status) VALUES ('Owner B', $1, $2, 'owner', 'active') RETURNING id, email",
        [`sb-outsider-${unique}@trustvault.internal`, hash]
      );
      outsiderUser = outRes.rows[0];
      createdUserIds.add(outsiderUser.id);

      // Viewer with access
      const vRes = await pool.query(
        "INSERT INTO users (name, email, password_hash, role, status) VALUES ('Viewer A', $1, $2, 'viewer', 'active') RETURNING id, email",
        [`sb-viewer-${unique}@trustvault.internal`, hash]
      );
      viewerUser = vRes.rows[0];
      createdUserIds.add(viewerUser.id);

      // Suspended Viewer
      const svRes = await pool.query(
        "INSERT INTO users (name, email, password_hash, role, status) VALUES ('Suspended Viewer', $1, $2, 'viewer', 'suspended') RETURNING id, email",
        [`sb-suspended-${unique}@trustvault.internal`, hash]
      );
      suspendedViewer = svRes.rows[0];
      createdUserIds.add(suspendedViewer.id);

      // Log in all agents with freshly acquired pre-login tokens
      const oCsrf = await getCsrfToken(ownerAgent);
      await ownerAgent
        .post("/api/auth/login")
        .set("X-CSRF-Token", oCsrf)
        .send({ email: ownerUser.email, password: "TrustVaultSupabase2026!" });

      const outCsrf = await getCsrfToken(outsiderAgent);
      await outsiderAgent
        .post("/api/auth/login")
        .set("X-CSRF-Token", outCsrf)
        .send({ email: outsiderUser.email, password: "TrustVaultSupabase2026!" });

      const vCsrf = await getCsrfToken(viewerAgent);
      await viewerAgent
        .post("/api/auth/login")
        .set("X-CSRF-Token", vCsrf)
        .send({ email: viewerUser.email, password: "TrustVaultSupabase2026!" });
    });

    beforeEach(() => {
      mockStorageFiles = new Map();
      mockSupabaseClient = {
        storage: {
          from: (bucket) => ({
            upload: jest.fn(async (path, buffer, options) => {
              mockStorageFiles.set(path, {
                buffer: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
                options,
                bucket
              });
              return { data: { path }, error: null };
            }),
            download: jest.fn(async (path) => {
              if (!mockStorageFiles.has(path)) {
                return {
                  data: null,
                  error: { message: `Object not found: ${path}`, statusCode: 404, status: 404 }
                };
              }
              const item = mockStorageFiles.get(path);
              return {
                data: {
                  arrayBuffer: async () => item.buffer.buffer.slice(
                    item.buffer.byteOffset,
                    item.buffer.byteOffset + item.buffer.byteLength
                  )
                },
                error: null
              };
            }),
            remove: jest.fn(async (paths) => {
              paths.forEach((p) => mockStorageFiles.delete(p));
              return { data: paths.map((p) => ({ name: p })), error: null };
            })
          })
        }
      };

      _setSupabaseClientForTesting(mockSupabaseClient, "supabase", "trustvault-documents");
    });

    it("uploads plaintext file through backend, stores ONLY ciphertext in Supabase Storage, and verifies preview", async () => {
      const rawPlaintext = "HIGHLY_SENSITIVE_CORPORATE_DOCUMENT_CONTENT_2026";
      const filename = "executive_briefing.pdf";

      // 1. Upload with fresh post-login CSRF token
      const token = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", token)
        .field("category", "Executive")
        .attach("file", Buffer.from(rawPlaintext), { filename, contentType: "application/pdf" });

      expect(uploadRes.status).toBe(201);
      const docId = uploadRes.body.document.id;
      createdDocIds.add(docId);

      const dbRes = await pool.query("SELECT storage_key FROM documents WHERE id = $1", [docId]);
      const storageKey = dbRes.rows[0].storage_key;

      // 2. Verify stored object in Supabase is ciphertext (never plaintext)
      expect(mockStorageFiles.has(storageKey)).toBe(true);
      const storedBytes = mockStorageFiles.get(storageKey).buffer;
      expect(storedBytes.toString("utf8")).not.toContain("HIGHLY_SENSITIVE_CORPORATE_DOCUMENT");
      expect(["TVE1", "TVE2"]).toContain(storedBytes.subarray(0, 4).toString("ascii"));

      // 3. Authorized Owner Preview
      const previewRes = await ownerAgent.get(`/api/documents/${docId}/preview`);
      expect(previewRes.status).toBe(200);
      expect(previewRes.headers["content-type"]).toContain("application/pdf");
      expect(previewRes.headers["content-disposition"]).toBe("inline");
      expect(previewRes.headers["cache-control"]).toContain("no-store");
      expect(previewRes.body.toString("utf8")).toBe(rawPlaintext);

      // 4. Grant permission to Viewer A
      const permToken = await getCsrfToken(ownerAgent);
      await ownerAgent
        .post(`/api/documents/${docId}/permissions`)
        .set("X-CSRF-Token", permToken)
        .send({ email: viewerUser.email, permission: "read" });

      // 5. Authorized Viewer Preview (Read-Only)
      const viewerPreviewRes = await viewerAgent.get(`/api/documents/${docId}/preview`);
      expect(viewerPreviewRes.status).toBe(200);
      expect(viewerPreviewRes.headers["content-disposition"]).toBe("inline");
      expect(viewerPreviewRes.body.toString("utf8")).toBe(rawPlaintext);
    });

    it("denies unauthorized and cross-tenant access to Supabase stored documents", async () => {
      // Owner A uploads document
      const token = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", token)
        .field("category", "Confidential")
        .attach("file", Buffer.from("SECRET_DATA"), { filename: "classified.pdf", contentType: "application/pdf" });

      const docId = uploadRes.body.document.id;
      createdDocIds.add(docId);

      // Unauthenticated access
      const unauthRes = await request(app).get(`/api/documents/${docId}/preview`);
      expect(unauthRes.status).toBe(401);

      // Cross-tenant Owner B access without grant
      const crossTenantRes = await outsiderAgent.get(`/api/documents/${docId}/preview`);
      expect(crossTenantRes.status).toBe(404);

      // Viewer without grant
      const noGrantRes = await viewerAgent.get(`/api/documents/${docId}/preview`);
      expect(noGrantRes.status).toBe(404);
    });

    it("blocks suspended users from accessing Supabase stored documents", async () => {
      // Owner uploads document
      const token = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", token)
        .attach("file", Buffer.from("FILE_CONTENT"), { filename: "policy.pdf", contentType: "application/pdf" });

      const docId = uploadRes.body.document.id;
      createdDocIds.add(docId);

      // Attempt login with suspended user
      const svCsrf = await getCsrfToken(suspendedViewerAgent);
      const loginRes = await suspendedViewerAgent
        .post("/api/auth/login")
        .set("X-CSRF-Token", svCsrf)
        .send({ email: suspendedViewer.email, password: "TrustVaultSupabase2026!" });

      expect(loginRes.status).toBe(403);
      expect(loginRes.body.error).toMatch(/(inactive|suspended)/i);

      // Direct preview attempt by suspended session is blocked
      const previewRes = await suspendedViewerAgent.get(`/api/documents/${docId}/preview`);
      expect(previewRes.status).toBe(401);
    });

    it("safely aborts database transaction when Supabase Storage upload fails (zero orphaned records)", async () => {
      // Configure mock to simulate cloud upload failure
      mockSupabaseClient.storage.from = () => ({
        upload: jest.fn(async () => ({
          data: null,
          error: { message: "Supabase S3 service unavailable or bucket quota exceeded" }
        }))
      });

      const token = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", token)
        .field("category", "General")
        .attach("file", Buffer.from("TEST_PAYLOAD"), { filename: "failed_upload.pdf", contentType: "application/pdf" });

      expect(uploadRes.status).toBe(500);

      // Verify no record exists in PostgreSQL
      const dbCheck = await pool.query("SELECT id FROM documents WHERE name = 'failed_upload.pdf'");
      expect(dbCheck.rows.length).toBe(0);
    });

    it("deletes document record from PostgreSQL and removes object from Supabase Storage", async () => {
      const token = await getCsrfToken(ownerAgent);
      const uploadRes = await ownerAgent
        .post("/api/documents")
        .set("X-CSRF-Token", token)
        .attach("file", Buffer.from("DELETE_ME"), { filename: "to_delete.pdf", contentType: "application/pdf" });

      const docId = uploadRes.body.document.id;
      createdDocIds.add(docId);

      const dbRes = await pool.query("SELECT storage_key FROM documents WHERE id = $1", [docId]);
      const storageKey = dbRes.rows[0].storage_key;
      expect(mockStorageFiles.has(storageKey)).toBe(true);

      // Delete document
      const delToken = await getCsrfToken(ownerAgent);
      const deleteRes = await ownerAgent
        .delete(`/api/documents/${docId}`)
        .set("X-CSRF-Token", delToken);

      expect(deleteRes.status).toBe(200);

      // Verify deleted from cloud storage
      expect(mockStorageFiles.has(storageKey)).toBe(false);

      // Verify deleted from PostgreSQL
      const dbCheck = await pool.query("SELECT id FROM documents WHERE id = $1", [docId]);
      expect(dbCheck.rows.length).toBe(0);
    });
  });
});
