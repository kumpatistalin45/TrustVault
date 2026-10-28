const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// Intercept CommonJS require('jose') for jwks-rsa in Node.js 22
const Module = require("module");
if (!global.__tv_jose_hooked) {
  global.__tv_jose_hooked = true;
  const originalLoad = Module._load;
  global.__tv_jose_promise = import("jose")
    .then((m) => {
      global.__tv_jose_module = m;
    })
    .catch((err) => {
      console.warn("[JOSE_DYNAMIC_IMPORT_WARN]", err.message);
    });

  Module._load = function (request, parent, isMain) {
    if (request === "jose" && global.__tv_jose_module) {
      return global.__tv_jose_module;
    }
    return originalLoad.apply(this, arguments);
  };
}

const admin = require("firebase-admin");
const crypto = require("crypto");

let firebaseApp = null;
let mockVerifier = null;
let mockLinkSender = null;

function isFirebaseConfigured() {
  if (mockVerifier) return true;
  if (firebaseApp) return true;

  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();
  return Boolean(projectId && clientEmail && privateKey);
}

function initFirebaseAdmin() {
  if (firebaseApp) return firebaseApp;

  const existingApp = (admin.apps || []).find(
    (a) => a && a.name === "trustvault-firebase-admin"
  );
  if (existingApp) {
    firebaseApp = existingApp;
    return firebaseApp;
  }

  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  let privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").trim();

  if (!projectId) {
    return null;
  }

  try {
    if (clientEmail && privateKey) {
      if (
        (privateKey.startsWith('"') && privateKey.endsWith('"')) ||
        (privateKey.startsWith("'") && privateKey.endsWith("'"))
      ) {
        privateKey = privateKey.slice(1, -1);
      }
      if (privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      firebaseApp = admin.initializeApp(
        {
          credential: admin.cert({
            projectId,
            clientEmail,
            privateKey
          })
        },
        "trustvault-firebase-admin"
      );
    } else {
      firebaseApp = admin.initializeApp(
        {
          projectId
        },
        "trustvault-firebase-admin"
      );
    }
    return firebaseApp;
  } catch (err) {
    console.error("Firebase Admin initialization error:", err.message);
    throw new Error(`Failed to initialize Firebase Admin SDK: ${err.message}`);
  }
}

/**
 * Verifies a Firebase ID token.
 * Returns decoded token containing { email, uid, ... }.
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Invalid Firebase ID token format");
  }

  if (mockVerifier) {
    return mockVerifier(idToken);
  }

  const app = initFirebaseAdmin();
  if (!app) {
    throw new Error(
      "Firebase Admin is not configured on the backend. Please provide FIREBASE_PROJECT_ID in backend/.env"
    );
  }

  try {
    const { getAuth } = require("firebase-admin/auth");
    const auth = getAuth(app);
    const decodedToken = await auth.verifyIdToken(idToken.trim());
    if (!decodedToken || !decodedToken.email) {
      throw new Error("Firebase ID token does not contain a verified email address");
    }
    return decodedToken;
  } catch (err) {
    throw new Error(`Firebase token verification failed: ${err.message}`);
  }
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return "***";
  const parts = email.trim().split("@");
  if (parts.length !== 2) return "***";
  const [user, domain] = parts;
  if (user.length <= 2) {
    return `${user[0] || "*"}***@${domain}`;
  }
  return `${user.slice(0, 2)}***${user.slice(-1)}@${domain}`;
}

/**
 * Generates a Firebase passwordless sign-in link for the given email address.
 * Uses Firebase Admin SDK to create the link server-side.
 * The continuation URL points back to the frontend with `apiToken` embedded as a
 * query parameter so the frontend can send it back to the backend on completion.
 *
 * @param {string} email - normalized email address
 * @param {string} apiToken - raw application token (NOT the hash) included in continuationUrl
 * @param {string} continueUrl - base frontend URL for the sign-in callback
 * @returns {Promise<string>} the Firebase sign-in link
 */
async function generateFirebaseSignInLink(email, apiToken, continueUrl) {
  const masked = maskEmail(email);
  console.log(`[AUTH_LINK_DIAGNOSTIC] Starting sign-in link generation for recipient=${masked}`);

  if (mockLinkSender) {
    const link = await mockLinkSender(email, apiToken, continueUrl);
    console.log(`[AUTH_LINK_DIAGNOSTIC] Sign-in link generated successfully (mock) for recipient=${masked}`);
    return link;
  }

  const app = initFirebaseAdmin();
  if (!app) {
    console.error(`[AUTH_LINK_DIAGNOSTIC] Sign-in link generation failed for recipient=${masked}: code=FIREBASE_ADMIN_UNCONFIGURED`);
    throw new Error(
      "Firebase Admin SDK is not configured. Please provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in backend/.env"
    );
  }

  if (!global.__tv_jose_module && global.__tv_jose_promise) {
    try {
      await global.__tv_jose_promise;
    } catch (_e) {}
  }

  const { getAuth } = require("firebase-admin/auth");
  const auth = getAuth(app);

  const actionCodeSettings = {
    // The continuation URL includes the raw apiToken so the frontend can extract and send it
    // along with the Firebase ID token to the backend for 10-minute expiry gate enforcement.
    url: `${continueUrl}?apiToken=${encodeURIComponent(apiToken)}`,
    handleCodeInApp: true
  };

  try {
    const link = await auth.generateSignInWithEmailLink(email, actionCodeSettings);
    console.log(`[AUTH_LINK_DIAGNOSTIC] Sign-in link generated successfully for recipient=${masked}`);
    return link;
  } catch (err) {
    console.error(`[AUTH_LINK_DIAGNOSTIC] Sign-in link generation failed for recipient=${masked}: code=${err.code || "UNKNOWN"}, message=${err.message}`);
    throw new Error(`Firebase sign-in link generation failed: ${err.message}`);
  }
}

/**
 * Generates a cryptographically secure 32-byte random token.
 * Returns { rawToken, tokenHash } — store only the hash.
 */
function generateSecureToken() {
  const rawToken = crypto.randomBytes(32).toString("hex"); // 64-char hex string
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

/**
 * Hashes a raw token for database lookup.
 */
function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Testing helpers to inject mock implementations
function _setFirebaseAdminForTesting(verifier) {
  mockVerifier = verifier;
}

function _resetFirebaseAdminForTesting() {
  mockVerifier = null;
}

function _setFirebaseLinkSenderForTesting(sender) {
  mockLinkSender = sender;
}

function _resetFirebaseLinkSenderForTesting() {
  mockLinkSender = null;
}

module.exports = {
  maskEmail,
  isFirebaseConfigured,
  initFirebaseAdmin,
  verifyFirebaseIdToken,
  generateFirebaseSignInLink,
  generateSecureToken,
  hashToken,
  _setFirebaseAdminForTesting,
  _resetFirebaseAdminForTesting,
  _setFirebaseLinkSenderForTesting,
  _resetFirebaseLinkSenderForTesting
};
