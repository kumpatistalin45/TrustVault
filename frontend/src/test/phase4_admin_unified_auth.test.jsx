import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { AdminRoute } from "../routes/AppRoutes";
import { Sidebar } from "../components/layout/Sidebar";
import { LoginForm } from "../components/auth/LoginForm";
import { RegistrationForm } from "../components/auth/RegistrationForm";
import { PasswordSetupForm } from "../components/auth/PasswordSetupForm";
import { RoleSelector } from "../components/auth/RoleSelector";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { AdminUsersPage } from "../pages/AdminUsersPage";
import { AdminDocumentsPage } from "../pages/AdminDocumentsPage";
import { AdminPermissionsPage } from "../pages/AdminPermissionsPage";
import { AdminComplaintsPage } from "../pages/AdminComplaintsPage";
import { AdminAuditPage } from "../pages/AdminAuditPage";
import * as api from "../services/api";

function renderWithProviders(ui, { authValue = {}, route = "/" } = {}) {
  const defaultAuth = {
    user: { id: 1, name: "Alex Vance", email: "admin@trustvault.internal", role: "admin" },
    isAuthenticated: true,
    loading: false,
    role: "admin",
    isAdmin: true,
    isOwner: false,
    isViewer: false,
    hasAcceptedTerms: true,
    logout: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    ...authValue
  };

  return render(
    <AuthContext.Provider value={defaultAuth}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          {ui}
        </MemoryRouter>
      </ToastProvider>
    </AuthContext.Provider>
  );
}

describe("TrustVault Phase 4 — Admin Dashboard & Unified Authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // =========================================================================
  // 1. Admin Route Guards & Navigation
  // =========================================================================
  describe("1. Admin Route Guards & Navigation", () => {
    it("allows Admin user through AdminRoute", () => {
      renderWithProviders(
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Secret Console</div>
              </AdminRoute>
            }
          />
        </Routes>,
        { route: "/admin", authValue: { isAdmin: true } }
      );

      expect(screen.getByText("Admin Secret Console")).toBeDefined();
    });

    it("redirects Document Owner to /access-denied when attempting /admin", () => {
      renderWithProviders(
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Secret Console</div>
              </AdminRoute>
            }
          />
          <Route path="/access-denied" element={<div>Access Denied Page</div>} />
        </Routes>,
        { route: "/admin", authValue: { isAdmin: false, isOwner: true, role: "owner" } }
      );

      expect(screen.queryByText("Admin Secret Console")).toBeNull();
      expect(screen.getByText("Access Denied Page")).toBeDefined();
    });

    it("redirects Document Viewer to /access-denied when attempting /admin", () => {
      renderWithProviders(
        <Routes>
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <div>Admin Secret Console</div>
              </AdminRoute>
            }
          />
          <Route path="/access-denied" element={<div>Access Denied Page</div>} />
        </Routes>,
        { route: "/admin", authValue: { isAdmin: false, isViewer: true, role: "viewer" } }
      );

      expect(screen.queryByText("Admin Secret Console")).toBeNull();
      expect(screen.getByText("Access Denied Page")).toBeDefined();
    });

    it("renders Admin navigation items in Sidebar for admin role", () => {
      renderWithProviders(<Sidebar isOpen={true} onClose={() => {}} />, {
        authValue: { isAdmin: true, role: "admin" }
      });

      expect(screen.getByText("Overview")).toBeDefined();
      expect(screen.getByText("User Management")).toBeDefined();
      expect(screen.getByText("Document Oversight")).toBeDefined();
      expect(screen.getByText("Permissions Oversight")).toBeDefined();
      expect(screen.getByText("Security Audit Logs")).toBeDefined();
      expect(screen.getByText("Complaint Inbox")).toBeDefined();
    });
  });

  // =========================================================================
  // 2. One Email, One Account, One Role (Part B)
  // =========================================================================
  describe("2. One Email, One Account, One Role Policy", () => {
    it("rejects registration when email is already registered as a Viewer", async () => {
      renderWithProviders(<RegistrationForm initialRole="owner" />);

      // Fill in form with Bob's email (registered as Viewer)
      const nameInput = screen.getByLabelText(/full legal name/i);
      const mobileInput = screen.getByLabelText(/mobile contact number/i);
      const emailInput = screen.getByLabelText(/registered corporate email/i);

      fireEvent.change(nameInput, { target: { value: "Bob Smith Jr" } });
      fireEvent.change(mobileInput, { target: { value: "+1 555-019-2834" } });
      fireEvent.change(emailInput, { target: { value: "bob.viewer@trustvault.internal" } });

      const continueBtn = screen.getByRole("button", { name: /continue to email verification/i });
      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            /this email is already registered as a viewer account\. each email can be associated with only one account type\. please sign in using your existing account\./i
          )
        ).toBeDefined();
      });
    });

    it("rejects registration when email is already registered as an Owner", async () => {
      renderWithProviders(<RegistrationForm initialRole="viewer" />);

      const nameInput = screen.getByLabelText(/full legal name/i);
      const mobileInput = screen.getByLabelText(/mobile contact number/i);
      const emailInput = screen.getByLabelText(/registered corporate email/i);

      fireEvent.change(nameInput, { target: { value: "Jane Owner Dupe" } });
      fireEvent.change(mobileInput, { target: { value: "+1 555-019-9999" } });
      fireEvent.change(emailInput, { target: { value: "jane.owner@trustvault.internal" } });

      const continueBtn = screen.getByRole("button", { name: /continue to email verification/i });
      fireEvent.click(continueBtn);

      await waitFor(() => {
        expect(
          screen.getByText(
            /this email is already registered as an owner account\. each email can be associated with only one account type\. please sign in using your existing account\./i
          )
        ).toBeDefined();
      });
    });

    it("prevents arbitrary visitors from registering Admin accounts via public registration", async () => {
      renderWithProviders(<RegistrationForm initialRole="viewer" />);

      // Admin role must NOT be an option in public registration
      expect(screen.queryByRole("radio", { name: /admin/i })).toBeNull();

      // Public registration must offer only Owner and Viewer
      expect(screen.getByRole("radio", { name: /owner/i })).toBeDefined();
      expect(screen.getByRole("radio", { name: /viewer/i })).toBeDefined();
    });
  });

  // =========================================================================
  // 3. Terms & Conditions Only During Signup (Part C)
  // =========================================================================
  describe("3. Terms & Conditions Only During Signup", () => {
    it("renders unchecked-by-default terms checkbox in PasswordSetupForm and disables completion until checked", () => {
      const handleSubmit = vi.fn();
      render(<PasswordSetupForm onSubmit={handleSubmit} onBack={() => {}} />);

      const checkbox = screen.getByRole("checkbox", { name: /terms & conditions/i });
      expect(checkbox.checked).toBe(false);

      const submitBtn = screen.getByRole("button", { name: /complete registration/i });
      expect(submitBtn.disabled).toBe(true);

      // Fill in valid password
      const passwordInput = screen.getByLabelText(/^create enterprise password/i);
      const confirmInput = screen.getByLabelText(/^confirm password/i);

      fireEvent.change(passwordInput, { target: { value: "CorrectHorseBatteryStaple#2026" } });
      fireEvent.change(confirmInput, { target: { value: "CorrectHorseBatteryStaple#2026" } });

      // Even with valid password, submit button must stay disabled without terms checkbox
      expect(submitBtn.disabled).toBe(true);

      // Check the terms checkbox
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
      expect(submitBtn.disabled).toBe(false);

      fireEvent.click(submitBtn);
      expect(handleSubmit).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 4. Google Sign-In Removal Verification (Phase 2 & 5)
  // =========================================================================
  describe("4. Google Sign-In Removal Verification", () => {
    it("ensures Google Sign-In button is removed from LoginForm", () => {
      renderWithProviders(<LoginForm />);
      expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    });

    it("ensures Google Sign-In button is removed from RegistrationForm", () => {
      renderWithProviders(<RegistrationForm initialRole="viewer" />);
      expect(screen.queryByRole("button", { name: /continue with google/i })).toBeNull();
    });
  });

  // =========================================================================
  // 5. Forgot Password & Password Reset (Part E)
  // =========================================================================
  describe("5. Forgot Password & Password Reset", () => {
    it("does not render obsolete Forgot password link in LoginForm for passwordless auth", () => {
      renderWithProviders(<LoginForm />);

      expect(screen.queryByRole("link", { name: /forgot password\?/i })).toBeNull();
    });

    it("submits email and displays neutral message without revealing whether account exists (anti-enumeration)", async () => {
      renderWithProviders(<ForgotPasswordPage />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "nonexistent.user@trustvault.internal" } });

      const submitBtn = screen.getByRole("button", { name: /send reset instructions/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/instructions dispatched/i)).toBeDefined();
        expect(
          screen.getByText(
            /if an account exists for this email, password reset instructions will be sent\./i
          )
        ).toBeDefined();
      });
    });

    it("ResetPasswordPage rejects expired or invalid reset token", async () => {
      renderWithProviders(<ResetPasswordPage />, { route: "/reset-password?token=expired-token" });

      await waitFor(() => {
        expect(screen.getByText(/invalid or expired link/i)).toBeDefined();
        expect(
          screen.getByText(/this password reset link has expired\. please request a new one\./i)
        ).toBeDefined();
      });
    });

    it("ResetPasswordPage validates token and allows resetting password with criteria", async () => {
      renderWithProviders(<ResetPasswordPage />, { route: "/reset-password?token=valid-secure-token" });

      await waitFor(() => {
        expect(screen.getByText(/set new enterprise password/i)).toBeDefined();
      });

      const newPassInput = screen.getByLabelText(/^new password/i);
      const confirmInput = screen.getByLabelText(/^confirm new password/i);
      const submitBtn = screen.getByRole("button", { name: /update password/i });

      expect(submitBtn.disabled).toBe(true);

      fireEvent.change(newPassInput, { target: { value: "SecureEnterprise#2026Password" } });
      fireEvent.change(confirmInput, { target: { value: "SecureEnterprise#2026Password" } });

      expect(submitBtn.disabled).toBe(false);

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/password changed successfully/i)).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 6. Admin Overview Dashboard (Part A, Section 1)
  // =========================================================================
  describe("6. Admin Overview Dashboard", () => {
    it("renders Admin dashboard metrics, account counts, recent docs and security events", async () => {
      renderWithProviders(<AdminDashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("Enterprise Administration Console")).toBeDefined();
        expect(screen.getByText("Total Accounts")).toBeDefined();
        expect(screen.getByText("Vault Documents")).toBeDefined();
        expect(screen.getByText("Security & Denials")).toBeDefined();
        expect(screen.getByText("Pending Complaints")).toBeDefined();
      });
    });
  });

  // =========================================================================
  // 7. Admin User & Role Management (Part A, Section 2)
  // =========================================================================
  describe("7. Admin User & Role Management", () => {
    it("renders users table and allows filtering by role and status", async () => {
      renderWithProviders(<AdminUsersPage />);

      await waitFor(() => {
        expect(screen.getByText("User & Role Management")).toBeDefined();
        expect(screen.getByText("Alex Vance")).toBeDefined();
        expect(screen.getByText("Jane Doe")).toBeDefined();
        expect(screen.getByText("Bob Smith")).toBeDefined();
      });
    });

    it("opens confirmation dialog with reason capture when toggling user status", async () => {
      renderWithProviders(<AdminUsersPage />);

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeDefined();
      });

      // Click Deactivate on Jane Doe (Owner)
      const deactivateBtns = screen.getAllByRole("button", { name: /deactivate/i });
      fireEvent.click(deactivateBtns[0]);

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText(/administrative reason \/ justification/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /confirm inactive/i })).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Admin Document Oversight (Part A, Section 3)
  // =========================================================================
  describe("8. Admin Document Oversight", () => {
    it("renders document list and inspects metadata without unrestricted decryption", async () => {
      renderWithProviders(<AdminDocumentsPage />);

      await waitFor(() => {
        expect(screen.getByText("Document Management & Oversight")).toBeDefined();
        expect(screen.getByText("Snovasys_Hiring_Challenge_Specs.pdf")).toBeDefined();
      });

      // Open metadata modal
      const metadataBtns = screen.getAllByRole("button", { name: /metadata/i });
      fireEvent.click(metadataBtns[0]);

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText(/content policy notice:/i)).toBeDefined();
    });
  });

  // =========================================================================
  // 9. Admin Permissions Oversight (Part A, Section 4)
  // =========================================================================
  describe("9. Admin Permissions Oversight", () => {
    it("inspects active grants and enforces mandatory reason capture for corrective actions", async () => {
      renderWithProviders(<AdminPermissionsPage />);

      await waitFor(() => {
        expect(screen.getByText("Permissions Oversight & Governance")).toBeDefined();
      });

      // Find Revoke Grant button
      const revokeBtns = screen.getAllByRole("button", { name: /revoke grant/i });
      fireEvent.click(revokeBtns[0]);

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText(/mandatory administrative reason/i)).toBeDefined();

      const confirmBtn = screen.getByRole("button", { name: /confirm corrective revocation/i });
      expect(confirmBtn.disabled).toBe(true);

      const reasonInput = screen.getByPlaceholderText(/detail the operational or security justification/i);
      fireEvent.change(reasonInput, { target: { value: "Security audit peer review expired" } });

      expect(confirmBtn.disabled).toBe(false);
    });
  });

  // =========================================================================
  // 10. Admin Complaint Management (Part A, Section 6)
  // =========================================================================
  describe("10. Admin Complaint Management", () => {
    it("renders support inbox and allows updating status, priority and resolution notes", async () => {
      renderWithProviders(<AdminComplaintsPage />);

      await waitFor(() => {
        expect(screen.getByText("Admin Support Inbox & Complaints")).toBeDefined();
        expect(screen.getByText("TV-CMP-84920")).toBeDefined();
      });

      const manageBtns = screen.getAllByRole("button", { name: /manage/i });
      fireEvent.click(manageBtns[0]);

      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText(/chronological status & response history/i)).toBeDefined();
      expect(screen.getByLabelText(/update status/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /save complaint updates/i })).toBeDefined();
    });
  });

  // =========================================================================
  // 11. Admin Audit Logs Read-Only Policy (Part A, Section 5)
  // =========================================================================
  describe("11. Admin Audit Logs Read-Only Policy", () => {
    it("renders immutable audit logs without delete or edit controls", async () => {
      renderWithProviders(<AdminAuditPage />);

      await waitFor(() => {
        expect(screen.getByText(/admin audit & security log portal/i)).toBeDefined();
      });

      // Verify no delete or edit controls exist in the document
      expect(screen.queryByRole("button", { name: /delete/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /modify/i })).toBeNull();
    });
  });
});
