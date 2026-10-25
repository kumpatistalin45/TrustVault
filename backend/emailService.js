const nodemailer = require("nodemailer");

/**
 * TrustVault Transactional Email Service
 * 
 * Manages SMTP transport, template rendering, and safe delivery of 
 * password reset requests and administrative complaint notifications.
 */

let activeTransporter = null;

/**
 * Mask email address safely for diagnostic logging (e.g. jo***e@company.com).
 * Never logs raw recipient email addresses.
 */
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
 * Check if all required SMTP credentials are provided in the environment.
 */
function isEmailConfigured() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return Boolean(host && host.trim() && user && user.trim() && pass && pass.trim());
}

/**
 * Validate configuration status. Missing config does not crash development,
 * but production logs a warning or throws when delivery is requested.
 */
function validateEmailConfig(isProduction = process.env.NODE_ENV === "production") {
  const configured = isEmailConfigured();
  if (!configured) {
    if (isProduction) {
      console.warn("[EMAIL_CONFIG_WARNING] SMTP credentials are not fully configured. Live email delivery will be unavailable.");
    }
  }
  return configured;
}

/**
 * Create or return the current Nodemailer transporter.
 * Configured for Gmail SMTP when smtp.gmail.com / port 587 is specified,
 * using STARTTLS (secure: false) and TLSv1.2+.
 */
function getTransporter() {
  if (activeTransporter) {
    return activeTransporter;
  }

  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  // Port 587 uses STARTTLS (secure: false); Port 465 uses direct SSL/TLS (secure: true)
  const secure =
    process.env.SMTP_SECURE === "true"
      ? true
      : process.env.SMTP_SECURE === "false"
      ? false
      : port === 465;

  let user = (process.env.SMTP_USER || "").trim();
  if (user && user.endsWith("@gmail@gmail.com")) {
    user = user.replace(/@gmail@gmail\.com$/i, "@gmail.com");
  }
  let pass = (process.env.SMTP_PASS || "").trim();

  if (!host) {
    return null;
  }

  const isGmail = host.toLowerCase() === "smtp.gmail.com";

  activeTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production" || isGmail,
      minVersion: "TLSv1.2"
    }
  });

  return activeTransporter;
}

/**
 * Verify SMTP connection and authentication using Nodemailer's verify() method.
 * Returns { success: boolean, message?: string, error?: string, category?: string, code?: string }
 */
async function verifySmtpConnection() {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      success: false,
      category: "CONFIGURATION_MISSING",
      code: "SMTP_NOT_CONFIGURED",
      error: "SMTP transporter is not configured. Missing SMTP_HOST in backend environment."
    };
  }

  try {
    await transporter.verify();
    return {
      success: true,
      message: "SMTP server connection and authentication verified successfully."
    };
  } catch (err) {
    let category = "DISPATCH_ERROR";
    const code = err.code || "UNKNOWN";
    if (code === "EAUTH" || err.responseCode === 535) {
      category = "AUTH_FAILED";
    } else if (
      code === "ESOCKET" ||
      code === "ETIMEDOUT" ||
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND"
    ) {
      category = "CONNECTION_FAILED";
    }

    return {
      success: false,
      category,
      code,
      error: err.message
    };
  }
}

/**
 * Injects a custom or mock transporter (used for testing).
 */
function setTransporter(transporter) {
  activeTransporter = transporter;
}

/**
 * Resets the transporter to default environment-based configuration.
 */
function resetTransporter() {
  activeTransporter = null;
}

/**
 * HTML Template for Password Reset Request
 */
function renderPasswordResetTemplate({ resetUrl, userEmail }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrustVault Password Reset</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 32px 40px; text-align: left;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">TrustVault</span>
                    <span style="display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">Enterprise Document Security</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 40px 40px 32px 40px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;">Password Reset Request</h1>
              <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 24px;">
                We received a request to reset your credentials for your TrustVault account. Click the button below to establish a new, secure corporate password.
              </p>
              <!-- Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #2563eb;">
                    <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Reset Your Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; line-height: 20px; color: #64748b; margin-top: 24px; margin-bottom: 8px;">
                <strong>Security Notice:</strong> This recovery link is strictly valid for <strong>15 minutes</strong> and is invalidated upon first use.
              </p>
              <p style="font-size: 12px; line-height: 18px; color: #94a3b8; margin-top: 8px; margin-bottom: 24px;">
                If the button above does not work, copy and paste this secure link into your browser:<br>
                <a href="${resetUrl}" style="color: #2563eb; word-break: break-all; text-decoration: underline;">${resetUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;">
              <p style="font-size: 12px; line-height: 18px; color: #94a3b8; margin: 0;">
                If you did not request this password reset, please contact your security administrator immediately. Your current password remains active and secure.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                TrustVault Inc. &bull; Zero-Knowledge Document Governance &bull; Confidential & Automated Notice
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * HTML Template for Complaint Status Notification
 */
function renderComplaintNotificationTemplate({ complaint, responseNote }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrustVault Support Update</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <tr>
            <td style="background-color: #0f172a; padding: 32px 40px; text-align: left;">
              <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">TrustVault</span>
              <span style="display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">Support Resolution Center</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 32px 40px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;">Support Ticket Update</h1>
              <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 20px;">
                An administrator has posted an update to your support request <strong>${complaint.reference_id}</strong>.
              </p>
              
              <div style="background-color: #f8fafc; border-left: 4px solid #2563eb; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                <p style="font-size: 13px; font-weight: 600; color: #1e293b; margin: 0 0 6px 0;">Subject: ${complaint.subject || "Support Inquiry"}</p>
                <p style="font-size: 12px; color: #64748b; margin: 0 0 10px 0;">Status: <strong>${complaint.status || "Updated"}</strong> &bull; Priority: <strong>${complaint.priority || "Medium"}</strong></p>
                <div style="font-size: 13px; line-height: 20px; color: #334155; background-color: #ffffff; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                  ${responseNote}
                </div>
              </div>

              <p style="font-size: 12px; line-height: 18px; color: #94a3b8; margin: 0;">
                You can review the complete timeline and submit additional details anytime by logging in to the TrustVault Support Center.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                TrustVault Inc. &bull; Enterprise Document Security &bull; Automated Ticket Notification
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send password reset email containing secure single-use recovery link.
 * 
 * Never logs raw tokens, passwords, or credentials.
 */
async function sendPasswordResetEmail({ to, rawToken }) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email is required");
  }
  if (!rawToken || typeof rawToken !== "string") {
    throw new Error("Raw token is required");
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("Email delivery service is not configured");
  }

  const frontendOrigin = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim();
  const resetUrl = `${frontendOrigin.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const from = process.env.EMAIL_FROM || "TrustVault Security <no-reply@trustvault.internal>";

  const mailOptions = {
    from,
    to: to.trim().toLowerCase(),
    subject: "TrustVault — Secure Password Reset Request",
    text: `TrustVault Password Reset Request\n\nWe received a request to reset the password for your TrustVault account.\n\nPlease visit the following link within 15 minutes to reset your credentials:\n${resetUrl}\n\nThis recovery link is valid for single use only.\nIf you did not request this change, you can safely ignore this email.`,
    html: renderPasswordResetTemplate({ resetUrl, userEmail: to.trim().toLowerCase() })
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info?.messageId || "delivered" };
  } catch (err) {
    // Avoid exposing internal SMTP credentials or low-level connection stack
    console.error("[EMAIL_DISPATCH_FAILURE] Failed to dispatch password reset email.");
    throw new Error("Email delivery failed");
  }
}

/**
 * Send complaint update notification to user when admin explicitly requests notification.
 */
async function sendComplaintNotificationEmail({ to, complaint, responseNote }) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email is required");
  }
  if (!complaint || !complaint.reference_id) {
    throw new Error("Valid complaint with reference ID is required");
  }

  const transporter = getTransporter();
  if (!transporter) {
    throw new Error("Email delivery service is not configured");
  }

  const from = process.env.EMAIL_FROM || "TrustVault Support <no-reply@trustvault.internal>";
  const mailOptions = {
    from,
    to: to.trim().toLowerCase(),
    subject: `TrustVault Support Update: [${complaint.reference_id}] ${complaint.subject || "Support Request"}`,
    text: `TrustVault Support Update\n\nTicket: ${complaint.reference_id}\nSubject: ${complaint.subject || ""}\nStatus: ${complaint.status || ""}\n\nUpdate:\n${responseNote}\n\nView details in your TrustVault portal.`,
    html: renderComplaintNotificationTemplate({ complaint, responseNote })
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info?.messageId || "delivered" };
  } catch (err) {
    console.error("[EMAIL_DISPATCH_FAILURE] Failed to dispatch complaint update notification.");
    throw new Error("Email delivery failed");
  }
}

/**
 * HTML Template for Passwordless Email Sign-In Link
 */
function renderSignInLinkTemplate({ signInLink, userEmail, expiresInMinutes = 10 }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrustVault Sign-In Link</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background-color: #0f172a; padding: 32px 40px; text-align: left;">
              <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">TrustVault</span>
              <span style="display: block; font-size: 11px; color: #94a3b8; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">Zero-Knowledge Document Security</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px 40px 32px 40px;">
              <h1 style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 16px;">Your Secure Sign-In Link</h1>
              <p style="font-size: 14px; line-height: 24px; color: #475569; margin-bottom: 24px;">
                You requested passwordless sign-in for <strong>${userEmail}</strong>. Click the button below to verify your identity and access your vault.
              </p>
              <!-- Action Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background-color: #0f172a;">
                    <a href="${signInLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px;">
                      Verify & Sign In to TrustVault
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-size: 13px; line-height: 20px; color: #64748b; margin-top: 24px; margin-bottom: 8px;">
                <strong>Security Notice:</strong> This sign-in link is strictly valid for <strong>${expiresInMinutes} minutes</strong> and is invalidated upon first use or if another link is requested.
              </p>
              <p style="font-size: 12px; line-height: 18px; color: #94a3b8; margin-top: 8px; margin-bottom: 24px;">
                If the button above does not work, copy and paste this link into your browser:<br>
                <a href="${signInLink}" style="color: #2563eb; word-break: break-all; text-decoration: underline;">${signInLink}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 28px 0;">
              <p style="font-size: 12px; line-height: 18px; color: #94a3b8; margin: 0;">
                If you did not request this link, no action is needed. Your vault remains locked and protected.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #f1f5f9;">
              <p style="font-size: 11px; color: #94a3b8; margin: 0;">
                TrustVault Inc. &bull; Enterprise Document Security &bull; Confidential & Automated Notice
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send passwordless sign-in link email.
 * Never logs raw tokens, sign-in links, passwords, or credentials.
 */
async function sendSignInLinkEmail({ to, signInLink, expiresInMinutes = 10 }) {
  if (!to || typeof to !== "string") {
    throw new Error("Recipient email is required");
  }
  if (!signInLink || typeof signInLink !== "string") {
    throw new Error("Sign-in link is required");
  }

  const masked = maskEmail(to);
  console.log(`[EMAIL_DIAGNOSTIC] Email-send attempt started for recipient=${masked}`);

  const transporter = getTransporter();
  const provider = transporter ? "SMTP" : "NONE";
  console.log(`[EMAIL_DIAGNOSTIC] Delivery provider selected: ${provider}`);

  if (!transporter) {
    const errorDetails = {
      success: false,
      provider: "NONE",
      category: "CONFIGURATION_MISSING",
      code: "SMTP_NOT_CONFIGURED",
      reason: "SMTP transport is not configured. Missing SMTP_HOST in backend environment."
    };
    console.error(`[EMAIL_DIAGNOSTIC] Provider response status: FAILED, category=${errorDetails.category}, code=${errorDetails.code}`);
    return errorDetails;
  }

  const rawFrom = (process.env.EMAIL_FROM || process.env.SMTP_USER || "no-reply@trustvault.internal").trim();
  const from = rawFrom.includes("<") ? rawFrom : `TrustVault Security <${rawFrom}>`;
  const mailOptions = {
    from,
    to: to.trim().toLowerCase(),
    subject: "TrustVault — Secure Passwordless Sign-In Link",
    text: `TrustVault Sign-In Link\n\nClick the link below within ${expiresInMinutes} minutes to sign in:\n${signInLink}\n\nThis link is valid for single use only.`,
    html: renderSignInLinkTemplate({ signInLink, userEmail: to.trim().toLowerCase(), expiresInMinutes })
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const messageId = info?.messageId || "delivered";
    console.log(`[EMAIL_DIAGNOSTIC] Provider response status: SUCCESS, provider=SMTP, messageId=${messageId}`);
    return {
      success: true,
      provider: "SMTP",
      messageId
    };
  } catch (err) {
    let category = "DISPATCH_ERROR";
    const code = err.code || "UNKNOWN";
    if (code === "EAUTH" || err.responseCode === 535) {
      category = "AUTH_FAILED";
    } else if (code === "ESOCKET" || code === "ETIMEDOUT" || code === "ECONNREFUSED" || code === "ENOTFOUND") {
      category = "CONNECTION_FAILED";
    } else if (code === "EENVELOPE" || err.responseCode === 550 || err.responseCode === 553) {
      category = "RECIPIENT_REJECTED";
    }

    console.error(`[EMAIL_DIAGNOSTIC] Provider response status: FAILED, provider=SMTP, category=${category}, code=${code}`);
    return {
      success: false,
      provider: "SMTP",
      category,
      code,
      error: err.message
    };
  }
}

module.exports = {
  maskEmail,
  isEmailConfigured,
  validateEmailConfig,
  getTransporter,
  setTransporter,
  resetTransporter,
  verifySmtpConnection,
  sendPasswordResetEmail,
  sendComplaintNotificationEmail,
  sendSignInLinkEmail,
  renderSignInLinkTemplate
};

