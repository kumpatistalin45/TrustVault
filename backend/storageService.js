const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");

const STORAGE_DIR = path.resolve(__dirname, "storage");

// Ensure local storage directory exists with restricted access mode
fs.mkdirSync(STORAGE_DIR, {
  recursive: true,
  mode: 0o700
});

function storagePathForKey(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    throw new Error("Invalid storage key");
  }

  const filePath = path.resolve(STORAGE_DIR, key);

  if (path.dirname(filePath) !== STORAGE_DIR) {
    throw new Error("Invalid storage path");
  }

  return filePath;
}

let supabaseClient = null;
let supabaseBucketName = "trustvault-documents";
let activeProvider = "local"; // "local" | "supabase"

function getStorageProvider() {
  const provider = (process.env.STORAGE_PROVIDER || "").trim().toLowerCase();
  if (provider === "supabase" || (!provider && process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY))) {
    return "supabase";
  }
  return "local";
}

function isSupabaseConfigured() {
  return Boolean(supabaseClient);
}

function initSupabaseStorage() {
  const provider = getStorageProvider();
  if (provider !== "supabase") {
    supabaseClient = null;
    activeProvider = "local";
    return null;
  }

  let supabaseUrl = (process.env.SUPABASE_URL || "").trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  const bucketName = (process.env.SUPABASE_STORAGE_BUCKET || "trustvault-documents").trim();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase Storage configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) must be specified when STORAGE_PROVIDER=supabase. Silently falling back to local storage is prohibited."
    );
  }

  if (!/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error(
      "Supabase Storage configuration error: SUPABASE_URL must be a valid HTTP/HTTPS URL."
    );
  }

  try {
    const parsedUrl = new URL(supabaseUrl);
    supabaseUrl = parsedUrl.origin;
  } catch (_urlErr) {
    // Keep validated URL
  }

  let createClient;
  try {
    createClient = require("@supabase/supabase-js").createClient;
  } catch (err) {
    throw new Error(
      `Supabase Storage configuration error: @supabase/supabase-js module could not be loaded: ${err.message}`
    );
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    supabaseBucketName = bucketName;
    activeProvider = "supabase";
    return supabaseClient;
  } catch (err) {
    throw new Error(
      `Supabase Storage configuration error: Failed to initialize Supabase client: ${err.message}`
    );
  }
}

function validateStorageConfig(isProduction = false) {
  const provider = getStorageProvider();
  if (provider === "supabase") {
    initSupabaseStorage();
  } else if (isProduction && (process.env.STORAGE_PROVIDER || "").toLowerCase() === "supabase") {
    throw new Error(
      "Supabase Storage configuration error: STORAGE_PROVIDER is set to 'supabase' in production but Supabase client initialization failed."
    );
  }
}

// Auto-initialize on module load if Supabase is configured
try {
  if (getStorageProvider() === "supabase") {
    initSupabaseStorage();
  }
} catch (initErr) {
  if ((process.env.STORAGE_PROVIDER || "").toLowerCase() === "supabase") {
    console.error("[STORAGE_INIT_ERROR]", initErr.message);
    if (process.env.NODE_ENV === "production") {
      throw initErr;
    }
  }
}

function getActiveProvider() {
  const envProvider = (process.env.STORAGE_PROVIDER || "").trim().toLowerCase();
  if (envProvider === "local") {
    return "local";
  }
  if (envProvider === "supabase") {
    return "supabase";
  }
  if (supabaseClient) {
    return activeProvider;
  }
  return getStorageProvider();
}

/**
 * Save AES-256-GCM encrypted envelope buffer to private storage.
 */
async function saveEncryptedFile(key, buffer) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    throw new Error("Invalid storage key format");
  }

  const provider = getActiveProvider();
  if (provider === "supabase") {
    if (!supabaseClient) {
      initSupabaseStorage();
    }
    if (supabaseClient) {
      const { error } = await supabaseClient.storage
        .from(supabaseBucketName)
        .upload(key, buffer, {
          contentType: "application/octet-stream",
          cacheControl: "no-store, no-cache, must-revalidate",
          upsert: false
        });

      if (error) {
        throw new Error(`Supabase Storage upload failed: ${error.message}`);
      }
      return;
    }

    throw new Error(
      "Supabase Storage error: Supabase client is not initialized. Refusing to write unauthenticated file to disk."
    );
  }

  const filePath = storagePathForKey(key);
  await fsp.writeFile(filePath, buffer, { flag: "wx", mode: 0o600 });
}

/**
 * Read AES-256-GCM encrypted envelope buffer from private storage.
 * Gracefully checks local storage for pre-existing documents when Supabase is active.
 */
async function readEncryptedFile(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    const err = new Error("Invalid storage key format");
    err.code = "ENOENT";
    throw err;
  }

  const provider = getActiveProvider();
  if (provider === "supabase") {
    if (!supabaseClient) {
      initSupabaseStorage();
    }
    if (supabaseClient) {
      const { data, error } = await supabaseClient.storage
        .from(supabaseBucketName)
        .download(key);

      if (error) {
        const isNotFound =
          error.statusCode === 404 ||
          error.status === 404 ||
          (error.message && error.message.toLowerCase().includes("not found")) ||
          (error.message && error.message.toLowerCase().includes("object not found"));

        if (isNotFound) {
          // Check local storage for pre-existing documents uploaded before Supabase was enabled
          try {
            const localPath = storagePathForKey(key);
            if (fs.existsSync(localPath)) {
              return await fsp.readFile(localPath);
            }
          } catch (_localErr) {}

          const notFoundErr = new Error(`Stored file not found in Supabase Storage: ${key}`);
          notFoundErr.code = "ENOENT";
          notFoundErr.status = 404;
          throw notFoundErr;
        }

        throw new Error(`Supabase Storage download failed: ${error.message}`);
      }

      if (Buffer.isBuffer(data)) {
        return data;
      } else if (data && typeof data.arrayBuffer === "function") {
        const arrayBuffer = await data.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
      return Buffer.from(data);
    }

    throw new Error("Supabase Storage error: Supabase client is not initialized.");
  }

  const filePath = storagePathForKey(key);
  return await fsp.readFile(filePath);
}

/**
 * Delete AES-256-GCM encrypted envelope from private storage.
 * Also cleans up local copy if it existed from pre-Supabase uploads.
 */
async function deleteEncryptedFile(key) {
  if (!/^[a-f0-9]{64}$/.test(String(key || ""))) {
    return;
  }

  const provider = getActiveProvider();
  if (provider === "supabase") {
    if (!supabaseClient) {
      initSupabaseStorage();
    }
    if (supabaseClient) {
      try {
        const { error } = await supabaseClient.storage
          .from(supabaseBucketName)
          .remove([key]);

        if (error && error.status !== 404 && error.statusCode !== 404) {
          console.error("Supabase file deletion warning:", error.message);
        }
      } catch (err) {
        console.error("Supabase file deletion error:", err.message);
      }
    }

    // Also remove local file if present from earlier local storage
    try {
      const localPath = storagePathForKey(key);
      if (fs.existsSync(localPath)) {
        await fsp.unlink(localPath);
      }
    } catch (_unlinkErr) {}

    return;
  }

  try {
    await fsp.unlink(storagePathForKey(key));
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.error("Could not remove stored file:", err.message);
    }
  }
}

// Testing helpers
function _setSupabaseClientForTesting(mockClient, provider = "supabase", mockBucketName = "trustvault-documents") {
  supabaseClient = mockClient;
  supabaseBucketName = mockBucketName;
  activeProvider = mockClient ? provider : "local";
}

function _resetStorageForTesting() {
  supabaseClient = null;
  supabaseBucketName = "trustvault-documents";
  activeProvider = "local";
}

module.exports = {
  saveEncryptedFile,
  readEncryptedFile,
  deleteEncryptedFile,
  storagePathForKey,
  STORAGE_DIR,
  getStorageProvider,
  isSupabaseConfigured,
  initSupabaseStorage,
  validateStorageConfig,
  _setSupabaseClientForTesting,
  _resetStorageForTesting
};
