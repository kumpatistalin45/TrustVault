/**
 * TrustVault MSG91 Authentication Service
 *
 * Implements official MSG91 OTP v5 API & Widget API for 6-digit Email OTP
 * generation, verification, resend cooldowns, and abuse protection.
 * Also maintains backwards-compatible SMS OTP methods.
 *
 * OTP storage is delegated directly to MSG91 — zero plaintext OTPs are
 * stored in PostgreSQL.
 */
const crypto = require("crypto");

const MSG91_BASE_URL = process.env.MSG91_BASE_URL || "https://control.msg91.com/api/v5/otp";
const MSG91_WIDGET_BASE_URL = process.env.MSG91_WIDGET_BASE_URL || "https://api.msg91.com/api/v5/widget";
const MSG91_EMAIL_SEND_URL = process.env.MSG91_EMAIL_SEND_URL || "https://control.msg91.com/api/v5/email/send";

// In-memory rate limiting and abuse defense trackers
const requestTracker = new Map(); // mobile -> { count, windowStart, lastRequestedAt }
const attemptTracker = new Map(); // mobile -> { attempts, lastAttemptAt }

// Email OTP rate limiting, cooldown, and attempt trackers
const emailRequestTracker = new Map(); // email -> { count, windowStart, lastRequestedAt, reqId }
const emailAttemptTracker = new Map(); // email -> { attempts, lastAttemptAt }

// Server-side secure OTP hash store:
// email -> { hash: string, salt: string, expiresAt: number, attempts: number, createdAt: number, reqId: string | null }
const emailOtpStore = new Map();

// Periodic unreffed cleanup of expired OTP tokens (runs every 5 minutes)
const otpCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [email, record] of emailOtpStore.entries()) {
    if (now > record.expiresAt) {
      emailOtpStore.delete(email);
    }
  }
}, 5 * 60 * 1000);
if (otpCleanupInterval.unref) otpCleanupInterval.unref();

const COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_VERIFY_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

let mockHandler = null;

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
function generateSecureOtp(length = 6) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Computes salted SHA-256 hash of an OTP string.
 */
function hashOtp(otp, salt) {
  return crypto.createHash("sha256").update(`${salt}:${otp}`).digest("hex");
}

// ============================================================================
// EMAIL OTP HELPERS & VALIDATION
// ============================================================================

/**
 * Normalizes and validates corporate email address.
 */
function normalizeEmail(rawEmail) {
  if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.trim()) {
    throw new Error("Corporate email address is required.");
  }

  const cleaned = rawEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) || cleaned.length > 255) {
    throw new Error("Please enter a valid corporate email format (e.g. employee@company.com).");
  }

  return cleaned;
}

/**
 * Checks whether MSG91 credentials for Email OTP are present in environment.
 */
function isMsg91EmailConfigured() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_EMAIL_TEMPLATE_ID;
  const widgetId = process.env.MSG91_WIDGET_ID;
  return Boolean(
    authKey &&
    authKey.trim() &&
    ((templateId && templateId.trim()) || (widgetId && widgetId.trim()))
  );
}

/**
 * Detailed configuration status reporter.
 * Reports exact missing variables instead of silently failing.
 */
function getMsg91EmailConfigurationStatus() {
  const authKey = Boolean(process.env.MSG91_AUTH_KEY && process.env.MSG91_AUTH_KEY.trim());
  const templateId = Boolean(process.env.MSG91_EMAIL_TEMPLATE_ID && process.env.MSG91_EMAIL_TEMPLATE_ID.trim());
  const widgetId = Boolean(process.env.MSG91_WIDGET_ID && process.env.MSG91_WIDGET_ID.trim());
  const domain = process.env.MSG91_DOMAIN || "edxpjh.mailer91.com";
  const fromEmail = process.env.MSG91_FROM_EMAIL || `auth@${domain}`;

  if (authKey && (templateId || widgetId)) {
    return {
      configured: true,
      channel: widgetId ? "widget" : "email_api",
      domain,
      from: fromEmail
    };
  }

  const missing = [];
  if (!authKey) missing.push("MSG91_AUTH_KEY");
  if (!templateId && !widgetId) missing.push("MSG91_EMAIL_TEMPLATE_ID or MSG91_WIDGET_ID");

  return {
    configured: false,
    missing,
    message: `MSG91 Email OTP is not configured. Missing required backend environment variables: ${missing.join(", ")}.`
  };
}

/**
 * Checks rate limits and 60-second cooldown for sending Email OTP.
 */
function checkEmailRequestCooldownAndLimits(normalizedEmail, throwOnError = false) {
  const now = Date.now();
  const entry = emailRequestTracker.get(normalizedEmail);

  if (entry) {
    // 1. Resend Cooldown Check (60 seconds)
    const elapsedSeconds = Math.floor((now - entry.lastRequestedAt) / 1000);
    if (elapsedSeconds < COOLDOWN_SECONDS) {
      const waitTime = COOLDOWN_SECONDS - elapsedSeconds;
      if (throwOnError) {
        const error = new Error(`Please wait ${waitTime} seconds before requesting a new OTP.`);
        error.code = "COOLDOWN";
        error.remainingSeconds = waitTime;
        throw error;
      }
      return { allowed: false, reason: "cooldown", cooldownRemaining: waitTime };
    }

    // 2. Hourly Rate Limit Check (Max 5 per hour)
    if (now - entry.windowStart < 60 * 60 * 1000) {
      if (entry.count >= MAX_REQUESTS_PER_HOUR) {
        if (throwOnError) {
          const error = new Error("Too many OTP requests for this email address. Please try again after one hour.");
          error.code = "RATE_LIMIT_EXCEEDED";
          throw error;
        }
        return { allowed: false, reason: "rate_limit" };
      }
    }
  }

  return { allowed: true };
}

/**
 * Records an Email OTP request in the tracking state.
 */
function recordEmailOtpRequest(normalizedEmail, reqId = null) {
  const now = Date.now();
  const entry = emailRequestTracker.get(normalizedEmail);

  if (entry) {
    if (now - entry.windowStart < 60 * 60 * 1000) {
      entry.count += 1;
      entry.lastRequestedAt = now;
      if (reqId) entry.reqId = reqId;
    } else {
      entry.count = 1;
      entry.windowStart = now;
      entry.lastRequestedAt = now;
      if (reqId) entry.reqId = reqId;
    }
  } else {
    emailRequestTracker.set(normalizedEmail, {
      count: 1,
      windowStart: now,
      lastRequestedAt: now,
      reqId: reqId || null
    });
  }

  // Clear previous failed attempts on new OTP request
  emailAttemptTracker.delete(normalizedEmail);
}

/**
 * Record a failed verification attempt for email. Returns remaining attempts.
 */
function recordEmailFailedAttempt(normalizedEmail) {
  const now = Date.now();
  const entry = emailAttemptTracker.get(normalizedEmail) || { attempts: 0, lastAttemptAt: now };

  if (now - entry.lastAttemptAt > ATTEMPT_WINDOW_MS) {
    entry.attempts = 1;
  } else {
    entry.attempts += 1;
  }

  entry.lastAttemptAt = now;
  emailAttemptTracker.set(normalizedEmail, entry);

  return Math.max(0, MAX_VERIFY_ATTEMPTS - entry.attempts);
}

/**
 * Check if verification attempts have been exhausted for email.
 */
function checkEmailVerifyAttempts(normalizedEmail, throwOnError = false) {
  const entry = emailAttemptTracker.get(normalizedEmail);
  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_VERIFY_ATTEMPTS };
  }

  const now = Date.now();
  const isWithinWindow = (now - entry.lastAttemptAt) < ATTEMPT_WINDOW_MS;
  if (isWithinWindow && entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    const lockoutRemaining = Math.max(1, Math.ceil((ATTEMPT_WINDOW_MS - (now - entry.lastAttemptAt)) / 1000));
    if (throwOnError) {
      const error = new Error("Too many failed verification attempts. Please request a new OTP.");
      error.code = "MAX_ATTEMPTS_EXCEEDED";
      error.lockoutRemaining = lockoutRemaining;
      throw error;
    }
    return { allowed: false, lockoutRemaining, remainingAttempts: 0 };
  }

  const remaining = isWithinWindow ? Math.max(0, MAX_VERIFY_ATTEMPTS - entry.attempts) : MAX_VERIFY_ATTEMPTS;
  return { allowed: true, remainingAttempts: remaining };
}

/**
 * Clear failed verification attempts for an email.
 */
function clearEmailVerifyAttempts(normalizedEmail) {
  emailAttemptTracker.delete(normalizedEmail);
}

// ============================================================================
// EMAIL OTP CORE DISPATCH & VERIFICATION METHODS
// ============================================================================

/**
 * Dispatches 6-digit OTP to corporate email via MSG91.
 * Uses official MSG91 Transactional Email API (https://control.msg91.com/api/v5/email/send)
 * with approved email template and verified domain.
 * Generates OTP using crypto.randomInt and stores only a secure salted SHA-256 hash.
 */
async function sendEmailOtp({ email, userName }) {
  const normalizedEmail = normalizeEmail(email);
  checkEmailRequestCooldownAndLimits(normalizedEmail, true);

  const otpLength = Number(process.env.MSG91_OTP_LENGTH || 6);
  const otpExpiryMinutes = Number(process.env.MSG91_OTP_EXPIRY || 5); // 5 minutes
  const otpExpiryMs = otpExpiryMinutes * 60 * 1000;

  // Use test mock handler if active (automated unit tests only)
  if (mockHandler) {
    if (typeof mockHandler.sendEmailOtp === "function") {
      const res = await mockHandler.sendEmailOtp({
        email: normalizedEmail,
        userName,
        otpLength,
        otpExpiry: otpExpiryMinutes
      });
      recordEmailOtpRequest(normalizedEmail, res?.reqId || res?.request_id || null);
      return res;
    }
    if (typeof mockHandler === "function") {
      const res = await mockHandler({
        action: "send_email",
        email: normalizedEmail,
        userName,
        otpLength,
        otpExpiry: otpExpiryMinutes
      });
      if (res && res.type === "error") {
        throw new Error(res.message || "Failed to dispatch email OTP via MSG91.");
      }
      recordEmailOtpRequest(normalizedEmail, res?.reqId || res?.request_id || null);
      return {
        success: true,
        message: res?.message || "Verification code dispatched to your corporate email.",
        cooldownSeconds: COOLDOWN_SECONDS,
        email: normalizedEmail,
        reqId: res?.reqId || res?.request_id || null
      };
    }
  }

  const status = getMsg91EmailConfigurationStatus();
  if (!status.configured) {
    throw new Error(status.message);
  }

  const authKey = process.env.MSG91_AUTH_KEY.trim();
  const widgetId = process.env.MSG91_WIDGET_ID;
  const templateId = process.env.MSG91_EMAIL_TEMPLATE_ID;

  // Option 1: MSG91 OTP Widget API (if widget ID is explicitly provided)
  if (widgetId && widgetId.trim()) {
    const url = `${MSG91_WIDGET_BASE_URL}/sendOtp`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authkey: authKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          widgetId: widgetId.trim(),
          identifier: normalizedEmail
        })
      });

      const data = await response.json().catch(() => ({}));
      if (data.type === "error" || data.status === "error") {
        throw new Error(data.message || "Failed to dispatch email OTP via MSG91 Widget.");
      }

      const reqId = data.message || data.reqId || null;
      recordEmailOtpRequest(normalizedEmail, reqId);
      return {
        success: true,
        message: "Verification code dispatched to your corporate email.",
        cooldownSeconds: COOLDOWN_SECONDS,
        email: normalizedEmail,
        reqId
      };
    } catch (err) {
      if (err.code === "COOLDOWN" || err.code === "RATE_LIMIT_EXCEEDED") throw err;
      console.error("[MSG91_WIDGET_EMAIL_DISPATCH_FAILURE]", err.message);
      throw new Error(err.message || "Unable to dispatch email verification code via MSG91.");
    }
  }

  // Option 2: MSG91 Official Transactional Email API (POST https://control.msg91.com/api/v5/email/send)
  // Generates cryptographically secure 6-digit OTP and salted SHA-256 hash
  const rawOtp = generateSecureOtp(otpLength);
  const salt = crypto.randomBytes(16).toString("hex");
  const otpHash = hashOtp(rawOtp, salt);

  const domain = (process.env.MSG91_DOMAIN || "edxpjh.mailer91.com").trim();
  const fromEmail = (process.env.MSG91_FROM_EMAIL || `no-reply@${domain}`).trim();
  const fromName = (process.env.MSG91_FROM_NAME || "").trim();
  const displayName = (userName && userName.trim()) || normalizedEmail;

  const payload = {
    recipients: [
      {
        to: [
          {
            email: normalizedEmail,
            name: displayName
          }
        ],
        variables: {
          user_name: displayName,
          otp: rawOtp,
          OTP: rawOtp,
          code: rawOtp
        }
      }
    ],
    from: fromName ? { email: fromEmail, name: fromName } : { email: fromEmail },
    domain,
    template_id: templateId.trim()
  };

  try {
    const response = await fetch(MSG91_EMAIL_SEND_URL, {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.status === "error" || data.hasError === true) {
      const errorMsg = data.message ||
        (data.errors && typeof data.errors === "object" ? Object.values(data.errors).flat().join(", ") : null) ||
        `MSG91 Email API returned status ${response.status}`;
      throw new Error(errorMsg);
    }

    const uniqueId = data.data?.unique_id || null;

    // Securely store salted hash in server-side memory store
    // Zero plaintext OTP is stored or logged
    emailOtpStore.set(normalizedEmail, {
      hash: otpHash,
      salt: salt,
      expiresAt: Date.now() + otpExpiryMs,
      attempts: 0,
      createdAt: Date.now(),
      reqId: uniqueId
    });

    recordEmailOtpRequest(normalizedEmail, uniqueId);

    return {
      success: true,
      message: "Verification code dispatched to your corporate email.",
      cooldownSeconds: COOLDOWN_SECONDS,
      email: normalizedEmail,
      reqId: uniqueId
    };
  } catch (err) {
    if (err.code === "COOLDOWN" || err.code === "RATE_LIMIT_EXCEEDED") throw err;
    console.error("[MSG91_EMAIL_DISPATCH_FAILURE]", err.message);
    throw new Error(err.message || "Unable to dispatch email verification code via MSG91.");
  }
}

/**
 * Server-side verification of 6-digit Email OTP.
 * Validates cryptographically against stored salted hash with constant-time comparison,
 * enforces single-use invalidation, expiration, and failed-attempt limits.
 */
async function verifyEmailOtp({ email, otp }) {
  const normalizedEmail = normalizeEmail(email);

  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    throw new Error("Verification code must be exactly 6 numeric digits.");
  }

  const cleanOtp = otp.trim();
  checkEmailVerifyAttempts(normalizedEmail, true);

  // Use test mock handler if active (automated unit tests only)
  if (mockHandler) {
    let result;
    if (typeof mockHandler.verifyEmailOtp === "function") {
      result = await mockHandler.verifyEmailOtp({ email: normalizedEmail, otp: cleanOtp });
    } else if (typeof mockHandler === "function") {
      const res = await mockHandler({ action: "verify_email", email: normalizedEmail, otp: cleanOtp });
      result = {
        success: res && (res.type === "success" || res.success === true),
        message: res?.message
      };
    }

    if (result) {
      if (!result.success) {
        const remaining = recordEmailFailedAttempt(normalizedEmail);
        const error = new Error(result.message || "Invalid or expired verification code.");
        error.remainingAttempts = remaining;
        throw error;
      }
      emailAttemptTracker.delete(normalizedEmail);
      return { success: true, message: result.message || "Email OTP verified successfully." };
    }
  }

  const status = getMsg91EmailConfigurationStatus();
  if (!status.configured) {
    throw new Error(status.message);
  }

  const authKey = process.env.MSG91_AUTH_KEY.trim();
  const widgetId = process.env.MSG91_WIDGET_ID;

  // Option 1: MSG91 OTP Widget Verify API
  if (widgetId && widgetId.trim()) {
    const url = `${MSG91_WIDGET_BASE_URL}/verifyOtp`;
    const reqEntry = emailRequestTracker.get(normalizedEmail);
    const reqId = reqEntry?.reqId;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authkey: authKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          widgetId: widgetId.trim(),
          ...(reqId ? { reqId } : { identifier: normalizedEmail }),
          otp: cleanOtp
        })
      });

      const data = await response.json();
      if (data.type !== "success" && data.status !== "success") {
        const remaining = recordEmailFailedAttempt(normalizedEmail);
        const error = new Error(data.message || "Invalid or expired verification code.");
        error.remainingAttempts = remaining;
        throw error;
      }

      emailAttemptTracker.delete(normalizedEmail);
      return { success: true, message: "Email OTP verified successfully." };
    } catch (err) {
      if (err.remainingAttempts !== undefined || err.code === "MAX_ATTEMPTS_EXCEEDED") throw err;
      console.error("[MSG91_WIDGET_VERIFY_FAILURE]", err.message);
      throw new Error("MSG91 OTP verification service temporarily unavailable.");
    }
  }

  // Option 2: Server-Side Cryptographic OTP Hash Verification
  const record = emailOtpStore.get(normalizedEmail);
  if (!record) {
    const remaining = recordEmailFailedAttempt(normalizedEmail);
    const error = new Error("No active verification code found or code has expired. Please request a new OTP.");
    error.remainingAttempts = remaining;
    throw error;
  }

  // Expiration Check (5 minutes)
  if (Date.now() > record.expiresAt) {
    emailOtpStore.delete(normalizedEmail);
    const remaining = recordEmailFailedAttempt(normalizedEmail);
    const error = new Error("Verification code has expired. Please request a new OTP.");
    error.remainingAttempts = remaining;
    throw error;
  }

  // Attempt Limit Check on current OTP
  if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
    emailOtpStore.delete(normalizedEmail);
    const error = new Error("Too many failed verification attempts. Please request a new OTP.");
    error.code = "MAX_ATTEMPTS_EXCEEDED";
    error.remainingAttempts = 0;
    throw error;
  }

  // Constant-time Hash Comparison
  const computedHash = hashOtp(cleanOtp, record.salt);
  const storedBuf = Buffer.from(record.hash, "utf8");
  const computedBuf = Buffer.from(computedHash, "utf8");

  const isMatch = storedBuf.length === computedBuf.length &&
    crypto.timingSafeEqual(storedBuf, computedBuf);

  if (!isMatch) {
    record.attempts += 1;
    const remaining = recordEmailFailedAttempt(normalizedEmail);

    if (record.attempts >= MAX_VERIFY_ATTEMPTS) {
      emailOtpStore.delete(normalizedEmail);
      const error = new Error("Too many failed verification attempts. Please request a new OTP.");
      error.code = "MAX_ATTEMPTS_EXCEEDED";
      error.remainingAttempts = 0;
      throw error;
    }

    const error = new Error("Invalid verification code. Please check and try again.");
    error.remainingAttempts = remaining;
    throw error;
  }

  // Verification Success: Invalidate single-use OTP immediately
  emailOtpStore.delete(normalizedEmail);
  emailAttemptTracker.delete(normalizedEmail);

  return { success: true, message: "Email OTP verified successfully." };
}

/**
 * Resends 6-digit OTP to corporate email.
 * Enforces 60-second cooldown and hourly rate limits.
 */
async function retryEmailOtp({ email, userName }) {
  const normalizedEmail = normalizeEmail(email);
  checkEmailRequestCooldownAndLimits(normalizedEmail, true);

  if (mockHandler) {
    if (typeof mockHandler.retryEmailOtp === "function") {
      const res = await mockHandler.retryEmailOtp({ email: normalizedEmail, userName });
      recordEmailOtpRequest(normalizedEmail);
      return res;
    }
    if (typeof mockHandler === "function") {
      const res = await mockHandler({ action: "retry_email", email: normalizedEmail, userName });
      if (res && res.type === "error") {
        throw new Error(res.message || "Failed to resend verification code.");
      }
      recordEmailOtpRequest(normalizedEmail);
      return {
        success: true,
        message: res?.message || "Verification code resent successfully.",
        cooldownSeconds: COOLDOWN_SECONDS
      };
    }
  }

  const status = getMsg91EmailConfigurationStatus();
  if (!status.configured) {
    throw new Error(status.message);
  }

  const widgetId = process.env.MSG91_WIDGET_ID;
  if (widgetId && widgetId.trim()) {
    const url = `${MSG91_WIDGET_BASE_URL}/retryOtp`;
    const reqEntry = emailRequestTracker.get(normalizedEmail);
    const reqId = reqEntry?.reqId;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          authkey: process.env.MSG91_AUTH_KEY.trim(),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          widgetId: widgetId.trim(),
          reqId
        })
      });

      const data = await response.json();
      if (data.type === "error" || data.status === "error") {
        throw new Error(data.message || "Failed to resend verification code.");
      }

      recordEmailOtpRequest(normalizedEmail, reqId);
      return {
        success: true,
        message: "Verification code resent successfully.",
        cooldownSeconds: COOLDOWN_SECONDS
      };
    } catch (err) {
      if (err.code === "COOLDOWN" || err.code === "RATE_LIMIT_EXCEEDED") throw err;
      console.error("[MSG91_WIDGET_RETRY_FAILURE]", err.message);
      throw new Error(err.message || "Unable to resend verification code at this time.");
    }
  }

  // Standard Transactional Email API Retry: Dispatches fresh 6-digit OTP
  return await sendEmailOtp({ email: normalizedEmail, userName });
}

// ============================================================================
// MOBILE PHONE NUMBER HELPERS (BACKWARDS-COMPATIBLE)
// ============================================================================

/**
 * Normalizes mobile number to E.164-compatible international format without '+'.
 * E.g., "+91 98765 43210" -> "919876543210".
 * 10-digit Indian numbers without country prefix default to '91'.
 */
function normalizePhoneNumber(rawNumber) {
  if (!rawNumber || typeof rawNumber !== "string" || !rawNumber.trim()) {
    throw new Error("Mobile phone number is required.");
  }

  let cleaned = rawNumber.replace(/[^\d]/g, "");

  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  if (cleaned.length === 10) {
    return `91${cleaned}`;
  }

  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error("Please enter a valid mobile number with country code (invalid length: 10-15 digits required).");
  }

  if (!/^\d+$/.test(cleaned)) {
    throw new Error("Please enter a valid mobile number (invalid format).");
  }

  return cleaned;
}

/**
 * Checks whether MSG91 credentials for mobile SMS are provided in the environment.
 */
function isMsg91Configured() {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  return Boolean(authKey && authKey.trim() && templateId && templateId.trim());
}

/**
 * Checks rate limits and cooldown for sending mobile SMS OTP.
 */
function checkRequestCooldownAndLimits(normalizedMobile, throwOnError = false) {
  const now = Date.now();
  const entry = requestTracker.get(normalizedMobile);

  if (entry) {
    const elapsedSeconds = Math.floor((now - entry.lastRequestedAt) / 1000);
    if (elapsedSeconds < COOLDOWN_SECONDS) {
      const waitTime = COOLDOWN_SECONDS - elapsedSeconds;
      if (throwOnError) {
        const error = new Error(`Please wait ${waitTime} seconds before requesting a new OTP.`);
        error.code = "COOLDOWN";
        error.remainingSeconds = waitTime;
        throw error;
      }
      return { allowed: false, reason: "cooldown", cooldownRemaining: waitTime };
    }

    if (now - entry.windowStart < 60 * 60 * 1000) {
      if (entry.count >= MAX_REQUESTS_PER_HOUR) {
        if (throwOnError) {
          const error = new Error("Too many OTP requests for this phone number. Please try again after one hour.");
          error.code = "RATE_LIMIT_EXCEEDED";
          throw error;
        }
        return { allowed: false, reason: "rate_limit" };
      }
    }
  }

  return { allowed: true };
}

/**
 * Records a mobile OTP request in the tracking state.
 */
function recordOtpRequest(normalizedMobile) {
  const now = Date.now();
  const entry = requestTracker.get(normalizedMobile);

  if (entry) {
    if (now - entry.windowStart < 60 * 60 * 1000) {
      entry.count += 1;
      entry.lastRequestedAt = now;
    } else {
      entry.count = 1;
      entry.windowStart = now;
      entry.lastRequestedAt = now;
    }
  } else {
    requestTracker.set(normalizedMobile, {
      count: 1,
      windowStart: now,
      lastRequestedAt: now
    });
  }

  attemptTracker.delete(normalizedMobile);
}

/**
 * Record a failed verification attempt for mobile. Returns remaining attempts.
 */
function recordFailedAttempt(normalizedMobile) {
  const now = Date.now();
  const entry = attemptTracker.get(normalizedMobile) || { attempts: 0, lastAttemptAt: now };

  if (now - entry.lastAttemptAt > ATTEMPT_WINDOW_MS) {
    entry.attempts = 1;
  } else {
    entry.attempts += 1;
  }

  entry.lastAttemptAt = now;
  attemptTracker.set(normalizedMobile, entry);

  return Math.max(0, MAX_VERIFY_ATTEMPTS - entry.attempts);
}

/**
 * Check if verification attempts have been exhausted for mobile.
 */
function checkVerifyAttempts(normalizedMobile, throwOnError = false) {
  const entry = attemptTracker.get(normalizedMobile);
  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_VERIFY_ATTEMPTS };
  }

  const now = Date.now();
  const isWithinWindow = (now - entry.lastAttemptAt) < ATTEMPT_WINDOW_MS;
  if (isWithinWindow && entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    const lockoutRemaining = Math.max(1, Math.ceil((ATTEMPT_WINDOW_MS - (now - entry.lastAttemptAt)) / 1000));
    if (throwOnError) {
      const error = new Error("Too many failed verification attempts. Please request a new OTP.");
      error.code = "MAX_ATTEMPTS_EXCEEDED";
      error.lockoutRemaining = lockoutRemaining;
      throw error;
    }
    return { allowed: false, lockoutRemaining, remainingAttempts: 0 };
  }

  const remaining = isWithinWindow ? Math.max(0, MAX_VERIFY_ATTEMPTS - entry.attempts) : MAX_VERIFY_ATTEMPTS;
  return { allowed: true, remainingAttempts: remaining };
}

/**
 * Clear failed verification attempts for a number.
 */
function clearVerifyAttempts(normalizedMobile) {
  attemptTracker.delete(normalizedMobile);
}

/**
 * Request 6-digit OTP delivery via MSG91 v5 API (Mobile SMS).
 */
async function sendOtp({ mobile }) {
  const normalizedMobile = normalizePhoneNumber(mobile);
  checkRequestCooldownAndLimits(normalizedMobile, true);

  const otpLength = Number(process.env.MSG91_OTP_LENGTH || 6);
  const otpExpiry = Number(process.env.MSG91_OTP_EXPIRY || 5);

  if (mockHandler) {
    if (typeof mockHandler.sendOtp === "function") {
      recordOtpRequest(normalizedMobile);
      return await mockHandler.sendOtp({
        mobile: normalizedMobile,
        otpLength,
        otpExpiry
      });
    }
    if (typeof mockHandler === "function") {
      const res = await mockHandler({ action: "send", mobile: normalizedMobile, otpLength, otpExpiry });
      if (res && res.type === "error") {
        throw new Error(res.message || "Failed to dispatch mobile OTP via provider.");
      }
      recordOtpRequest(normalizedMobile);
      return {
        success: true,
        message: res?.message || "Verification code sent successfully.",
        cooldownSeconds: COOLDOWN_SECONDS,
        normalizedMobile
      };
    }
  }

  if (!isMsg91Configured()) {
    throw new Error("SMS OTP delivery service is not configured. MSG91 credentials missing.");
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  const query = new URLSearchParams({
    template_id: templateId,
    mobile: normalizedMobile,
    otp_length: String(otpLength),
    otp_expiry: String(otpExpiry)
  });

  try {
    const response = await fetch(`${MSG91_BASE_URL}?${query.toString()}`, {
      method: "POST",
      headers: {
        authkey: authKey,
        "content-type": "application/json"
      }
    });

    const data = await response.json();

    if (data.type === "error") {
      throw new Error(data.message || "Failed to dispatch mobile OTP via provider.");
    }

    recordOtpRequest(normalizedMobile);
    return {
      success: true,
      message: "Verification code sent successfully.",
      cooldownSeconds: COOLDOWN_SECONDS,
      normalizedMobile
    };
  } catch (err) {
    if (err.code === "COOLDOWN" || err.code === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
    console.error("[MSG91_DISPATCH_FAILURE] Error communicating with MSG91 OTP gateway.");
    throw new Error("Unable to send SMS verification code at this time.");
  }
}

/**
 * Verify 6-digit OTP entered by user via MSG91 v5 Verify API (Mobile SMS).
 */
async function verifyOtp({ mobile, otp }) {
  const normalizedMobile = normalizePhoneNumber(mobile);

  if (!otp || typeof otp !== "string" || !/^\d{6}$/.test(otp.trim())) {
    throw new Error("Verification code must be exactly 6 numeric digits.");
  }

  const cleanOtp = otp.trim();
  checkVerifyAttempts(normalizedMobile, true);

  if (mockHandler) {
    let result;
    if (typeof mockHandler.verifyOtp === "function") {
      result = await mockHandler.verifyOtp({ mobile: normalizedMobile, otp: cleanOtp });
    } else if (typeof mockHandler === "function") {
      const res = await mockHandler({ action: "verify", mobile: normalizedMobile, otp: cleanOtp });
      result = {
        success: res && res.type === "success",
        message: res?.message
      };
    }

    if (result) {
      if (!result.success) {
        const remaining = recordFailedAttempt(normalizedMobile);
        const error = new Error(result.message || "Invalid or expired verification code.");
        error.remainingAttempts = remaining;
        throw error;
      }
      attemptTracker.delete(normalizedMobile);
      return { success: true, message: result.message || "Mobile number verified successfully." };
    }
  }

  if (!isMsg91Configured()) {
    throw new Error("SMS OTP verification service is not configured. MSG91 credentials missing.");
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const query = new URLSearchParams({
    mobile: normalizedMobile,
    otp: cleanOtp
  });

  try {
    const response = await fetch(`${MSG91_BASE_URL}/verify?${query.toString()}`, {
      method: "GET",
      headers: {
        authkey: authKey,
        accept: "application/json"
      }
    });

    const data = await response.json();

    if (data.type !== "success") {
      const remaining = recordFailedAttempt(normalizedMobile);
      const error = new Error("Invalid or expired verification code.");
      error.remainingAttempts = remaining;
      throw error;
    }

    attemptTracker.delete(normalizedMobile);
    return { success: true, message: "Mobile number verified successfully." };
  } catch (err) {
    if (err.remainingAttempts !== undefined || err.code === "MAX_ATTEMPTS_EXCEEDED") {
      throw err;
    }
    console.error("[MSG91_VERIFY_FAILURE] Error during MSG91 OTP verification.");
    throw new Error("Verification service temporarily unavailable.");
  }
}

/**
 * Retry / Resend OTP via MSG91 v5 Retry API (Mobile SMS).
 */
async function retryOtp({ mobile, retryType = "text" }) {
  const normalizedMobile = normalizePhoneNumber(mobile);
  checkRequestCooldownAndLimits(normalizedMobile, true);

  if (mockHandler) {
    if (typeof mockHandler.retryOtp === "function") {
      recordOtpRequest(normalizedMobile);
      return await mockHandler.retryOtp({ mobile: normalizedMobile, retryType });
    }
    if (typeof mockHandler === "function") {
      const res = await mockHandler({ action: "retry", mobile: normalizedMobile, retryType });
      if (res && res.type === "error") {
        throw new Error(res.message || "Failed to resend verification code.");
      }
      recordOtpRequest(normalizedMobile);
      return {
        success: true,
        message: res?.message || `Verification code resent via ${retryType}.`,
        cooldownSeconds: COOLDOWN_SECONDS
      };
    }
  }

  if (!isMsg91Configured()) {
    throw new Error("SMS OTP delivery service is not configured. MSG91 credentials missing.");
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const query = new URLSearchParams({
    authkey: authKey,
    mobile: normalizedMobile,
    retrytype: retryType
  });

  try {
    const response = await fetch(`${MSG91_BASE_URL}/retry?${query.toString()}`, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });

    const data = await response.json();

    if (data.type === "error") {
      throw new Error(data.message || "Failed to resend verification code.");
    }

    recordOtpRequest(normalizedMobile);
    return {
      success: true,
      message: "Verification code resent successfully.",
      cooldownSeconds: COOLDOWN_SECONDS
    };
  } catch (err) {
    if (err.code === "COOLDOWN" || err.code === "RATE_LIMIT_EXCEEDED") {
      throw err;
    }
    console.error("[MSG91_RETRY_FAILURE] Error during MSG91 OTP retry.");
    throw new Error("Unable to resend verification code at this time.");
  }
}

// ============================================================================
// TESTING UTILITIES & TRACKER LIFECYCLE
// ============================================================================

/**
 * Injects a mock handler for testing without sending real network requests.
 */
function setMockHandler(handler) {
  mockHandler = handler;
}

/**
 * Resets any active mock handler and clears in-memory trackers.
 */
function resetMockHandler() {
  mockHandler = null;
  requestTracker.clear();
  attemptTracker.clear();
  emailRequestTracker.clear();
  emailAttemptTracker.clear();
  emailOtpStore.clear();
}

/**
 * Clears in-memory trackers without resetting mock handler.
 */
function clearTrackers() {
  requestTracker.clear();
  attemptTracker.clear();
  emailRequestTracker.clear();
  emailAttemptTracker.clear();
  emailOtpStore.clear();
}

module.exports = {
  // Mobile OTP Exports
  isMsg91Configured,
  normalizePhoneNumber,
  sendOtp,
  verifyOtp,
  retryOtp,
  checkRequestCooldownAndLimits,
  recordOtpRequest,
  checkVerifyAttempts,
  recordFailedAttempt,
  clearVerifyAttempts,

  // Email OTP Exports
  isMsg91EmailConfigured,
  getMsg91EmailConfigurationStatus,
  normalizeEmail,
  sendEmailOtp,
  verifyEmailOtp,
  retryEmailOtp,
  checkEmailRequestCooldownAndLimits,
  recordEmailOtpRequest,
  checkEmailVerifyAttempts,
  recordEmailFailedAttempt,
  clearEmailVerifyAttempts,

  // Testing & Control Exports
  setMockHandler,
  resetMockHandler,
  clearTrackers,
  generateSecureOtp,
  hashOtp,
  _getEmailOtpStore: () => emailOtpStore,
  COOLDOWN_SECONDS,
  MAX_REQUESTS_PER_HOUR,
  MAX_VERIFY_ATTEMPTS
};
