import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { InlineAlert } from "./InlineAlert";
import { apiSendEmailLink, apiRegenerateEmailLink } from "../../services/api";
import {
  Mail,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Inbox,
  Link2
} from "lucide-react";

// Format seconds as MM:SS countdown string
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * EmailLinkLoginForm — Firebase Passwordless Email Link Authentication
 *
 * Flow:
 * 1. User enters email → backend validates account and sends Firebase email link
 * 2. "Check Your Email" screen shows 10-minute countdown
 * 3. User clicks link in email → /login/callback page handles completion
 * 4. Resend with cooldown; Regenerate after expiry
 *
 * This component handles steps 1 and 2.
 * The EmailLinkCallbackPage handles step 3 (link completion).
 */
export function EmailLinkLoginForm({
  onRoleChange,
  selectedRole = "viewer",
  className = ""
}) {
  const { showToast } = useToast();
  const navigate = useNavigate();

  // Multi-step state
  const [step, setStep] = useState("email"); // "email" | "pending"
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Pending/check-email screen state
  const [expiresAt, setExpiresAt] = useState(null);    // ISO string from server
  const [remainingSeconds, setRemainingSeconds] = useState(600); // local countdown
  const [cooldownSeconds, setCooldownSeconds] = useState(60);    // resend cooldown
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState("");
  const [resendError, setResendError] = useState("");
  const [linkExpired, setLinkExpired] = useState(false);

  const countdownRef = useRef(null);
  const cooldownRef = useRef(null);

  // ─── Countdown ticks ─────────────────────────────────────────────────────
  const startCountdown = useCallback((serverExpiresAt) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setLinkExpired(false);

    const tick = () => {
      const now = Date.now();
      const expiry = new Date(serverExpiresAt).getTime();
      const diff = Math.ceil((expiry - now) / 1000);

      if (diff <= 0) {
        setRemainingSeconds(0);
        setLinkExpired(true);
        clearInterval(countdownRef.current);
      } else {
        setRemainingSeconds(diff);
      }
    };

    tick();
    countdownRef.current = setInterval(tick, 1000);
  }, []);

  const startCooldown = useCallback((seconds) => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldownSeconds(seconds);

    const tick = () => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    };

    cooldownRef.current = setInterval(tick, 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // ─── Validation ───────────────────────────────────────────────────────────
  const validateEmail = () => {
    setEmailError("");
    setError("");
    const trimmed = email.trim();

    if (!trimmed) {
      setEmailError("Corporate email address is required.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError("Please enter a valid email address (e.g., user@company.com).");
      return false;
    }
    return true;
  };

  // ─── Step 1: Send sign-in link ────────────────────────────────────────────
  const handleSendLink = async (e) => {
    e.preventDefault();
    if (!validateEmail()) return;

    setLoading(true);
    setError("");

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await apiSendEmailLink({ email: trimmedEmail });

      // Store email in sessionStorage (tab-scoped, not persisted) so the callback
      // page can retrieve it to complete the Firebase sign-in. Cleared after use.
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem("tv_email_for_link_signin", trimmedEmail);
      }

      // Transition to pending screen
      const serverExpiresAt = res?.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString();
      setExpiresAt(serverExpiresAt);
      setStep("pending");
      startCountdown(serverExpiresAt);
      startCooldown(res?.cooldownSeconds || 60);
      setLinkExpired(false);
      setResendSuccess("");
      setResendError("");

    } catch (err) {
      if (err?.status === 429) {
        const cd = err?.data?.cooldownRemaining;
        if (cd) {
          setError(`Please wait ${cd} seconds before requesting another link.`);
        } else {
          setError(err?.message || "Too many requests. Please try again later.");
        }
      } else {
        setError(err?.message || "Failed to send sign-in link. Please check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── Regenerate link ──────────────────────────────────────────────────────
  const handleRegenerateLink = async () => {
    if ((cooldownSeconds > 0 && !linkExpired) || resendLoading) return;

    setResendLoading(true);
    setResendError("");
    setResendSuccess("");

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const res = await apiRegenerateEmailLink({ email: trimmedEmail });

      const serverExpiresAt = res?.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString();
      setExpiresAt(serverExpiresAt);
      startCountdown(serverExpiresAt);
      startCooldown(res?.cooldownSeconds || 60);
      setLinkExpired(false);
      setResendSuccess("A new sign-in link has been sent to your email.");

      if (showToast) {
        showToast("New sign-in link sent. Please check your email.", "success");
      }
    } catch (err) {
      if (err?.status === 429) {
        const cd = err?.data?.cooldownRemaining;
        setResendError(
          cd
            ? `Please wait ${cd} seconds before requesting another link.`
            : "Too many requests. Please try again later."
        );
      } else {
        setResendError(err?.message || "Failed to send a new sign-in link. Please try again.");
      }
    } finally {
      setResendLoading(false);
    }
  };

  // ─── Change email (go back) ───────────────────────────────────────────────
  const handleChangeEmail = () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setStep("email");
    setError("");
    setEmailError("");
    setResendSuccess("");
    setResendError("");
    setLinkExpired(false);
  };

  // ─── Countdown display styling ────────────────────────────────────────────
  const countdownColor = linkExpired
    ? "#dc2626"
    : remainingSeconds <= 60
    ? "#d97706"
    : "#059669";

  const countdownBg = linkExpired
    ? "rgba(220, 38, 38, 0.06)"
    : remainingSeconds <= 60
    ? "rgba(217, 119, 6, 0.06)"
    : "rgba(5, 150, 105, 0.06)";

  const countdownBorder = linkExpired
    ? "rgba(220, 38, 38, 0.18)"
    : remainingSeconds <= 60
    ? "rgba(217, 119, 6, 0.18)"
    : "rgba(5, 150, 105, 0.18)";

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Email input
  // ─────────────────────────────────────────────────────────────────────────
  if (step === "email") {
    return (
      <div className={`email-link-login-container ${className}`} style={{ width: "100%" }}>
        {error && <InlineAlert type="error" message={error} onClose={() => setError("")} />}

        <form onSubmit={handleSendLink} noValidate>
          {/* Email field */}
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="email-link-email"
              style={{
                display: "block",
                fontSize: "12.5px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-secondary)",
                marginBottom: "8px"
              }}
            >
              Registered Corporate Email
            </label>
            <div style={{ position: "relative" }}>
              <Mail
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="email-link-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                  if (error) setError("");
                }}
                disabled={loading}
                placeholder="e.g. employee@company.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.9)",
                  border: emailError ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "border-color 0.15s ease"
                }}
              />
            </div>
            {emailError && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {emailError}
              </span>
            )}
          </div>

          <button
            type="submit"
            id="email-link-send-btn"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "16px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            <span>{loading ? "Sending Secure Login Link..." : "Send Secure Login Link"}</span>
            <ArrowRight size={15} />
          </button>
        </form>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: "Check Your Email" pending screen with countdown
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`email-link-login-container ${className}`} style={{ width: "100%", boxSizing: "border-box" }}>
      {/* Email confirmation card */}
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "16px",
          background: "rgba(99, 102, 241, 0.06)",
          border: "1px solid rgba(99, 102, 241, 0.18)",
          marginBottom: "16px",
          boxSizing: "border-box"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "8px",
            gap: "8px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "#0f172a",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Inbox size={14} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)" }}>
              Sign-in link sent to:
            </span>
          </div>

          <button
            type="button"
            id="change-email-btn"
            onClick={handleChangeEmail}
            style={{
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "8px",
              color: "var(--accent-indigo, #6366f1)",
              fontSize: "11.5px",
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "4px 10px",
              transition: "all 0.15s ease"
            }}
          >
            <ArrowLeft size={12} />
            <span>Change Email</span>
          </button>
        </div>

        <div
          style={{
            fontSize: "13.5px",
            fontWeight: 700,
            color: "var(--text-primary)",
            wordBreak: "break-all",
            paddingLeft: "36px",
            lineHeight: 1.4
          }}
        >
          {email}
        </div>
      </div>

      {/* Countdown timer */}
      <div
        style={{
          padding: "14px 16px",
          borderRadius: "16px",
          background: countdownBg,
          border: `1px solid ${countdownBorder}`,
          marginBottom: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          boxSizing: "border-box"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "9px",
              background: linkExpired ? "rgba(220, 38, 38, 0.12)" : "rgba(5, 150, 105, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0
            }}
          >
            {linkExpired ? (
              <AlertCircle size={18} color={countdownColor} />
            ) : (
              <Clock size={18} color={countdownColor} />
            )}
          </div>
          <div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>
              {linkExpired ? "Status" : "Link expires in:"}
            </div>
            {linkExpired && (
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#dc2626" }}>
                Link Expired
              </div>
            )}
          </div>
        </div>

        {!linkExpired && (
          <div
            style={{
              fontSize: "20px",
              fontWeight: 700,
              color: countdownColor,
              fontFamily: "var(--font-mono, monospace)",
              letterSpacing: "0.04em",
              padding: "4px 12px",
              borderRadius: "10px",
              background: "rgba(255, 255, 255, 0.7)",
              border: `1px solid ${countdownBorder}`
            }}
          >
            {formatCountdown(remainingSeconds)}
          </div>
        )}
      </div>

      {/* Instruction text */}
      {!linkExpired && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: "14px",
            background: "rgba(15, 23, 42, 0.03)",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            marginBottom: "16px",
            fontSize: "12px",
            color: "var(--text-muted)",
            lineHeight: 1.55,
            boxSizing: "border-box"
          }}
        >
          <strong>Check your inbox.</strong> Click the <em>"Verify &amp; Sign In"</em> button in the email to complete authentication. The link is valid for exactly <strong>10 minutes</strong>.
        </div>
      )}

      {/* Alerts */}
      {resendSuccess && (
        <InlineAlert type="success" message={resendSuccess} onClose={() => setResendSuccess("")} />
      )}
      {resendError && (
        <InlineAlert type="error" message={resendError} onClose={() => setResendError("")} />
      )}

      {/* Resend / Regenerate controls */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", boxSizing: "border-box" }}>
        {linkExpired ? (
          <button
            type="button"
            id="regenerate-link-btn"
            onClick={handleRegenerateLink}
            disabled={resendLoading}
            className="btn-primary"
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "16px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: resendLoading ? "not-allowed" : "pointer"
            }}
          >
            <RefreshCw size={15} style={{ animation: resendLoading ? "spin 1s linear infinite" : "none" }} />
            <span>{resendLoading ? "Sending New Link..." : "Regenerate Verification Link"}</span>
          </button>
        ) : (
          <button
            type="button"
            id="resend-link-btn"
            onClick={handleRegenerateLink}
            disabled={cooldownSeconds > 0 || resendLoading}
            style={{
              background: cooldownSeconds > 0 ? "rgba(15, 23, 42, 0.04)" : "rgba(99, 102, 241, 0.08)",
              border: cooldownSeconds > 0 ? "1px solid rgba(226, 232, 240, 0.8)" : "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "12px",
              color: cooldownSeconds > 0 ? "var(--text-muted)" : "var(--accent-indigo, #6366f1)",
              fontSize: "12.5px",
              fontWeight: 600,
              cursor: cooldownSeconds > 0 ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              padding: "10px 16px",
              width: "100%",
              transition: "all 0.15s ease",
              boxSizing: "border-box"
            }}
          >
            <RotateCcw size={14} />
            <span>
              {cooldownSeconds > 0
                ? `Resend available in ${cooldownSeconds}s`
                : resendLoading
                ? "Sending new link..."
                : "Resend Sign-In Link"}
            </span>
          </button>
        )}
      </div>

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default EmailLinkLoginForm;
