import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { RoleSelector } from "./RoleSelector";
import { EmailOtpForm } from "./EmailOtpForm";
import { PasswordSetupForm } from "./PasswordSetupForm";
import { InlineAlert } from "./InlineAlert";
import { User, Mail, Phone, ArrowRight, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import { apiCheckEmailRoleConflict } from "../../services/api";

export function RegistrationForm({ initialRole = "viewer", className = "" }) {
  const { register } = useAuth();
  const navigate = useNavigate();

  // Multi-step registration state: 1 | 2 | 3
  const [currentStep, setCurrentStep] = useState(1);

  // Form Fields State (Public registration strictly Owner or Viewer)
  const [selectedRole, setSelectedRole] = useState(
    initialRole === "admin" ? "owner" : initialRole
  );
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // Validation & Error States
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // ----------------------------------------------------
  // Step 1: Account Details Validation & Role Conflict Check
  // ----------------------------------------------------
  const validateStep1 = () => {
    const errs = {};
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedMobile = mobile.trim();

    if (!trimmedName) {
      errs.name = "Full name is required.";
    } else if (trimmedName.length < 2) {
      errs.name = "Name must contain at least 2 characters.";
    }

    if (!trimmedMobile) {
      errs.mobile = "Mobile number is required.";
    } else if (!/^[+]?[\d\s().-]{7,20}$/.test(trimmedMobile)) {
      errs.mobile = "Please enter a valid mobile phone number.";
    }

    if (!trimmedEmail) {
      errs.email = "Registered email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = "Please enter a valid corporate email format.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleStep1Continue = async (e) => {
    e.preventDefault();
    setServerError("");
    if (!validateStep1()) return;

    if (selectedRole === "admin") {
      setServerError(
        "Admin accounts cannot be created via public registration. Contact your organization administrator for enterprise provisioning or an authorized invitation."
      );
      return;
    }

    // Enforce Part B: One Email, One Account, One Role conflict check
    try {
      const conflictCheck = await apiCheckEmailRoleConflict(email, selectedRole);
      if (conflictCheck?.conflict) {
        setServerError(conflictCheck.message);
        return;
      }
    } catch (_err) {
      // Continue if local check errors
    }

    setCurrentStep(2);
  };

  // ----------------------------------------------------
  // Step 2: Email Verification Callback
  // ----------------------------------------------------
  const handleStep2Verify = (code) => {
    setOtpCode(code);
    setCurrentStep(3);
  };

  // ----------------------------------------------------
  // Step 3: Password Completion Submission with Terms
  // ----------------------------------------------------
  const handleStep3Complete = async ({ password }) => {
    setLoading(true);
    setServerError("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const payload = {
        name: name.trim(),
        email: normalizedEmail,
        mobile: mobile.trim(),
        password,
        role: selectedRole,
        termsAccepted: true,
        termsVersion: "1.0",
        termsAcceptedAt: new Date().toISOString()
      };

      const result = await register(payload);

      if (result && (result.user || result.success)) {
        setRegistrationSuccess(true);
        const serverConfirmedRole = result.user?.role || selectedRole;

        // Auto-login & redirect to server-confirmed role dashboard
        setTimeout(() => {
          if (serverConfirmedRole === "admin") navigate("/admin");
          else if (serverConfirmedRole === "owner") navigate("/dashboard");
          else navigate("/documents");
        }, 1200);
      } else {
        setServerError("Registration could not be completed. Please check your network or try again.");
      }
    } catch (err) {
      setServerError(err?.message || "Registration failed. Server may be unavailable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`registration-form-container ${className}`} style={{ width: "100%" }}>
      {/* Step Progress Indicator */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "24px",
          padding: "0 4px"
        }}
      >
        {[
          { num: 1, label: "Details" },
          { num: 2, label: "Verification" },
          { num: 3, label: "Password" }
        ].map((step, idx) => {
          const isDone = currentStep > step.num;
          const isCurrent = currentStep === step.num;

          return (
            <React.Fragment key={step.num}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    background: isCurrent ? "#0f172a" : isDone ? "#059669" : "rgba(15, 23, 42, 0.08)",
                    color: isCurrent || isDone ? "#ffffff" : "var(--text-muted)",
                    transition: "all 0.2s ease"
                  }}
                >
                  {isDone ? <CheckCircle2 size={14} /> : step.num}
                </div>
                <span
                  className="step-label"
                  style={{
                    fontSize: "12.5px",
                    fontWeight: isCurrent ? 700 : 500,
                    color: isCurrent ? "var(--text-primary)" : "var(--text-muted)"
                  }}
                >
                  {step.label}
                </span>
              </div>

              {idx < 2 && (
                <div
                  style={{
                    flex: 1,
                    height: "2px",
                    margin: "0 10px",
                    background: isDone ? "#059669" : "rgba(15, 23, 42, 0.08)",
                    borderRadius: "9999px"
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Global Server Error in red inline text */}
      {serverError && (
        <InlineAlert
          type="error"
          message={serverError}
          onClose={() => setServerError("")}
        />
      )}

      {/* Success Notification */}
      {registrationSuccess && (
        <InlineAlert
          type="success"
          message="Account created successfully! Redirecting to login portal..."
        />
      )}

      {/* STEP 1: Account Details */}
      {currentStep === 1 && (
        <form onSubmit={handleStep1Continue} noValidate>
          {/* 1. Role Selection Buttons */}
          <RoleSelector
            selectedRole={selectedRole}
            onSelectRole={(r) => setSelectedRole(r)}
            disabled={loading}
            isRegistration={true}
          />

          {/* Full Name */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="reg-name"
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
              Full Legal Name
            </label>
            <div style={{ position: "relative" }}>
              <User
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors({ ...errors, name: "" });
                }}
                disabled={loading}
                placeholder="e.g. Jane Doe"
                autoComplete="name"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.8)",
                  border: errors.name ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
              />
            </div>
            {errors.name && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {errors.name}
              </span>
            )}
          </div>

          {/* Mobile Number */}
          <div style={{ marginBottom: "16px" }}>
            <label
              htmlFor="reg-mobile"
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
              Mobile Contact Number
            </label>
            <div style={{ position: "relative" }}>
              <Phone
                size={16}
                color="var(--text-muted)"
                style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                id="reg-mobile"
                type="tel"
                value={mobile}
                onChange={(e) => {
                  setMobile(e.target.value);
                  if (errors.mobile) setErrors({ ...errors, mobile: "" });
                }}
                disabled={loading}
                placeholder="e.g. +1 (555) 234-5678"
                autoComplete="tel"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.8)",
                  border: errors.mobile ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
              />
            </div>
            {errors.mobile && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {errors.mobile}
              </span>
            )}
          </div>

          {/* Email Address */}
          <div style={{ marginBottom: "24px" }}>
            <label
              htmlFor="reg-email"
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
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors({ ...errors, email: "" });
                }}
                disabled={loading}
                placeholder="e.g. employee@trustvault.internal"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "12px 14px 12px 42px",
                  fontSize: "13.5px",
                  background: "rgba(255, 255, 255, 0.8)",
                  border: errors.email ? "1.5px solid #ef4444" : "1px solid rgba(203, 213, 225, 0.8)",
                  borderRadius: "14px",
                  color: "var(--text-primary)",
                  outline: "none",
                  transition: "all 0.15s ease"
                }}
              />
            </div>
            {errors.email && (
              <span style={{ display: "block", color: "#dc2626", fontSize: "12px", fontWeight: 500, marginTop: "5px" }}>
                {errors.email}
              </span>
            )}
          </div>

          {/* Continue button */}
          <button
            type="submit"
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
              gap: "8px"
            }}
          >
            <span>Continue to Email Verification</span>
            <ArrowRight size={15} />
          </button>
        </form>
      )}


      {/* STEP 2: Email Verification */}
      {currentStep === 2 && (
        <EmailOtpForm
          email={email}
          onVerifySuccess={handleStep2Verify}
          onBack={() => setCurrentStep(1)}
        />
      )}

      {/* STEP 3: Set Password */}
      {currentStep === 3 && (
        <PasswordSetupForm
          onSubmit={handleStep3Complete}
          onBack={() => setCurrentStep(2)}
          loading={loading}
          error={serverError}
        />
      )}

      {/* Navigation link back to Login */}
      <div style={{ textAlign: "center", marginTop: "24px" }}>
        <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
          Already have an enterprise account?{" "}
          <Link
            to="/login"
            style={{
              color: "var(--text-primary)",
              fontWeight: 700,
              textDecoration: "underline"
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export default RegistrationForm;
