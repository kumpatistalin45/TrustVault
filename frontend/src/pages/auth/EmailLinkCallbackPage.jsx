import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  getFirebaseAuth
} from "../../services/firebase";
import { Shield, CheckCircle2, AlertCircle, Loader } from "lucide-react";

/**
 * EmailLinkCallbackPage — handles the Firebase email-link sign-in completion.
 *
 * This page is loaded when the user clicks the "Verify & Sign In" link in their email.
 * Firebase redirects to: /login/callback?apiToken=<rawToken>&<firebase-params...>
 *
 * Flow:
 * 1. Extract apiToken from search params (embedded by backend in continuation URL).
 * 2. Get the email from React state (passed via sessionStorage within this flow; cleared after use).
 * 3. Complete Firebase sign-in with email link → get Firebase ID token.
 * 4. Send { idToken, apiToken } to backend /api/auth/email-link/complete.
 * 5. Backend verifies: Firebase token valid + app token not expired/used (10-min gate).
 * 6. On success: redirect to correct dashboard.
 * 7. On failure: show appropriate error with option to request new link.
 *
 * Security: apiToken and email are NEVER stored in localStorage.
 * Email is stored in sessionStorage ONLY for the duration of this one-page flow,
 * then immediately cleared after use or on error.
 */
export function EmailLinkCallbackPage() {
  const { emailLinkLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error" | "needs_email"
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualEmailError, setManualEmailError] = useState("");

  const hasRun = useRef(false);

  useEffect(() => {
    // Prevent double-execution in React StrictMode
    if (hasRun.current) return;
    hasRun.current = true;

    handleEmailLinkCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEmailLinkCallback = async (emailOverride = null) => {
    setStatus("verifying");
    setError("");
    setErrorCode("");

    try {
      const auth = getFirebaseAuth();
      const currentUrl = window.location.href;

      // Verify this URL is indeed a Firebase sign-in link
      if (!auth || !isSignInWithEmailLink(auth, currentUrl)) {
        setStatus("error");
        setError("This page must be accessed via the sign-in link sent to your email. Please return to the login page and request a new link.");
        setErrorCode("INVALID_LINK");
        return;
      }

      // Extract apiToken from URL params (embedded by backend in continuation URL)
      const apiToken = searchParams.get("apiToken");
      if (!apiToken) {
        setStatus("error");
        setError("Invalid sign-in link: application token is missing. Please request a new link.");
        setErrorCode("MISSING_TOKEN");
        return;
      }

      // Get email: try sessionStorage first, then manual entry
      let email = emailOverride
        || sessionStorage.getItem("tv_email_for_link_signin")
        || "";

      if (!email || !email.includes("@")) {
        setStatus("needs_email");
        return;
      }

      email = email.trim().toLowerCase();

      // Complete Firebase sign-in with email link
      let idToken;
      try {
        const userCredential = await signInWithEmailLink(auth, email, currentUrl);
        idToken = await userCredential.user.getIdToken();
      } catch (firebaseErr) {
        const msg = firebaseErr?.message || "";
        // Clear potentially wrong email on firebase auth failures
        sessionStorage.removeItem("tv_email_for_link_signin");

        if (msg.includes("invalid-action-code") || msg.includes("expired-action-code")) {
          setStatus("error");
          setError("This sign-in link is invalid or has already been used. Please request a new link from the login page.");
          setErrorCode("FIREBASE_LINK_INVALID");
        } else if (msg.includes("user-disabled")) {
          setStatus("error");
          setError("Your account has been disabled. Please contact your administrator.");
          setErrorCode("ACCOUNT_DISABLED");
        } else if (msg.includes("wrong-email") || msg.includes("invalid-email")) {
          setStatus("needs_email");
          setManualEmailError("The email address entered does not match the sign-in link. Please try again.");
        } else {
          setStatus("error");
          setError(`Firebase authentication failed: ${msg}. Please request a new sign-in link.`);
          setErrorCode("FIREBASE_ERROR");
        }
        return;
      }

      // Clear sessionStorage email immediately after use
      sessionStorage.removeItem("tv_email_for_link_signin");

      // Send to backend: dual verification (Firebase ID token + app token)
      let result;
      try {
        result = await emailLinkLogin({ idToken, apiToken });
      } catch (backendErr) {
        const backendCode = backendErr?.data?.code || "";
        const backendMsg = backendErr?.message || "Authentication failed. Please request a new sign-in link.";

        setStatus("error");
        setError(backendMsg);
        setErrorCode(backendCode || "BACKEND_ERROR");
        return;
      }

      // Success
      setStatus("success");
      const userRole = result?.user?.role || "viewer";

      if (showToast) {
        showToast(`Signed in successfully as ${userRole.toUpperCase()}.`, "success");
      }

      // Redirect based on role (from DB, never from client)
      setTimeout(() => {
        if (userRole === "admin") {
          navigate("/admin", { replace: true });
        } else if (userRole === "owner") {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/viewer/dashboard", { replace: true });
        }
      }, 1200);

    } catch (unexpectedErr) {
      sessionStorage.removeItem("tv_email_for_link_signin");
      setStatus("error");
      setError(unexpectedErr?.message || "An unexpected error occurred. Please return to the login page.");
      setErrorCode("UNEXPECTED");
    }
  };

  // Handle manual email submission (when sessionStorage email is missing/wrong)
  const handleManualEmailSubmit = (e) => {
    e.preventDefault();
    setManualEmailError("");

    if (!manualEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim())) {
      setManualEmailError("Please enter the email address you used to request the sign-in link.");
      return;
    }

    handleEmailLinkCallback(manualEmail.trim().toLowerCase());
  };

  // ─── Rendering ─────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary, #f8fafc)",
        padding: "24px"
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "28px",
          padding: "48px 40px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 24px 60px rgba(15, 23, 42, 0.1)",
          textAlign: "center"
        }}
      >
        {/* TrustVault branding */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginBottom: "32px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "12px",
              background: "#0f172a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff"
            }}
          >
            <Shield size={20} />
          </div>
          <span
            style={{
              fontFamily: "var(--font-heading, sans-serif)",
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--text-primary, #0f172a)",
              letterSpacing: "-0.02em"
            }}
          >
            TrustVault
          </span>
        </div>

        {/* ── Verifying state ── */}
        {status === "verifying" && (
          <>
            <div style={{ marginBottom: "20px" }}>
              <Loader
                size={44}
                color="#6366f1"
                style={{ animation: "spin 1s linear infinite", marginBottom: "16px" }}
              />
              <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                Verifying Sign-In Link
              </h1>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Please wait while we complete your authentication...
              </p>
            </div>
          </>
        )}

        {/* ── Success state ── */}
        {status === "success" && (
          <>
            <CheckCircle2 size={48} color="#059669" style={{ marginBottom: "16px" }} />
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
              Access Granted
            </h1>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              Authentication successful. Redirecting you to your dashboard...
            </p>
          </>
        )}

        {/* ── Needs email entry ── */}
        {status === "needs_email" && (
          <>
            <div style={{ marginBottom: "20px" }}>
              <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px" }}>
                Confirm Your Email
              </h1>
              <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Please enter the email address you used to request the sign-in link.
              </p>
            </div>

            {manualEmailError && (
              <div
                style={{
                  background: "rgba(220, 38, 38, 0.06)",
                  border: "1px solid rgba(220, 38, 38, 0.2)",
                  borderRadius: "12px",
                  padding: "10px 14px",
                  marginBottom: "16px",
                  fontSize: "12.5px",
                  color: "#dc2626",
                  textAlign: "left"
                }}
              >
                {manualEmailError}
              </div>
            )}

            <form onSubmit={handleManualEmailSubmit} noValidate>
              <input
                id="callback-email-input"
                type="email"
                value={manualEmail}
                onChange={(e) => {
                  setManualEmail(e.target.value);
                  if (manualEmailError) setManualEmailError("");
                }}
                placeholder="your@email.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  fontSize: "14px",
                  background: "rgba(255, 255, 255, 0.95)",
                  border: "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  marginBottom: "14px",
                  boxSizing: "border-box"
                }}
              />
              <button
                type="submit"
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "14px",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Continue
              </button>
            </form>
          </>
        )}

        {/* ── Error state ── */}
        {status === "error" && (
          <>
            <AlertCircle size={48} color="#dc2626" style={{ marginBottom: "16px" }} />
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "12px" }}>
              {errorCode === "LINK_EXPIRED"
                ? "Link Expired"
                : errorCode === "LINK_USED"
                ? "Link Already Used"
                : "Authentication Failed"}
            </h1>
            <p
              style={{
                fontSize: "13.5px",
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                marginBottom: "24px"
              }}
            >
              {error}
            </p>
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="btn-primary"
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "14px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Return to Login
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default EmailLinkCallbackPage;
