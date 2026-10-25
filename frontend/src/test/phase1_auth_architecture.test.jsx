import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoleSelector } from "../components/auth/RoleSelector";
import { InlineAlert } from "../components/auth/InlineAlert";
import { LoginForm } from "../components/auth/LoginForm";
import { RegistrationForm } from "../components/auth/RegistrationForm";
import { EmailOtpForm } from "../components/auth/EmailOtpForm";
import { PasswordSetupForm } from "../components/auth/PasswordSetupForm";
import { SessionReplacedNotice } from "../components/session/SessionReplacedNotice";
import { SessionExpiredNotice } from "../components/session/SessionExpiredNotice";
import { AuthContext } from "../context/AuthContext";

const mockAuthContext = {
  user: null,
  isAuthenticated: false,
  loading: false,
  role: "viewer",
  login: vi.fn().mockResolvedValue({ user: { id: 1, role: "viewer" } }),
  register: vi.fn().mockResolvedValue({ user: { id: 1, role: "viewer" } }),
  logout: vi.fn()
};

function renderWithProviders(ui) {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <MemoryRouter>{ui}</MemoryRouter>
    </AuthContext.Provider>
  );
}

describe("TrustVault Phase 1 Frontend Architecture & UI", () => {
  describe("RoleSelector Component", () => {
    it("renders three separate clickable buttons for Admin, Owner, and Viewer", () => {
      render(<RoleSelector selectedRole="viewer" onSelectRole={() => {}} />);

      const radios = screen.getAllByRole("radio");
      expect(radios.length).toBe(3);

      expect(screen.getByText("Admin")).toBeDefined();
      expect(screen.getByText("Owner")).toBeDefined();
      expect(screen.getByText("Viewer")).toBeDefined();
    });

    it("indicates the selected role with aria-checked and distinct state", () => {
      render(<RoleSelector selectedRole="admin" onSelectRole={() => {}} />);

      const adminBtn = screen.getByRole("radio", { name: /admin/i });
      const viewerBtn = screen.getByRole("radio", { name: /viewer/i });

      expect(adminBtn.getAttribute("aria-checked")).toBe("true");
      expect(viewerBtn.getAttribute("aria-checked")).toBe("false");
    });

    it("triggers onSelectRole callback when a role button is clicked", () => {
      const handleSelect = vi.fn();
      render(<RoleSelector selectedRole="viewer" onSelectRole={handleSelect} />);

      const ownerBtn = screen.getByRole("radio", { name: /owner/i });
      fireEvent.click(ownerBtn);

      expect(handleSelect).toHaveBeenCalledWith("owner");
    });
  });

  describe("InlineAlert Component", () => {
    it("renders red inline error message with role='alert'", () => {
      render(<InlineAlert type="error" message="Invalid email or password." />);

      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
      expect(alert.textContent).toContain("Invalid email or password.");
    });
  });

  describe("LoginForm Component", () => {
    it("renders role selection buttons at the top of the login screen", () => {
      renderWithProviders(<LoginForm />);

      expect(screen.getByText("Select Access Role")).toBeDefined();
      expect(screen.getByRole("radio", { name: /admin/i })).toBeDefined();
      expect(screen.getByRole("radio", { name: /owner/i })).toBeDefined();
      expect(screen.getByRole("radio", { name: /viewer/i })).toBeDefined();
    });

    it("shows inline red error when submitting with empty email", async () => {
      renderWithProviders(<LoginForm />);

      const submitBtn = screen.getByRole("button", { name: /send secure login link/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/email address is required/i)).toBeDefined();
    });
  });

  describe("Multi-Step Registration Flow", () => {
    it("navigates through Step 1 (Details) -> Step 2 (Email OTP) -> Step 3 (Password)", async () => {
      renderWithProviders(<RegistrationForm />);

      // Step 1: Fill details
      expect(screen.getByText(/full legal name/i)).toBeDefined();
      expect(screen.getByText(/mobile contact number/i)).toBeDefined();
      expect(screen.getByText(/registered corporate email/i)).toBeDefined();

      const nameInput = screen.getByPlaceholderText(/jane doe/i);
      const mobileInput = screen.getByPlaceholderText(/\+1 \(555\) 234-5678/i);
      const emailInput = screen.getByPlaceholderText(/employee@trustvault.internal/i);

      fireEvent.change(nameInput, { target: { value: "Sarah Connor" } });
      fireEvent.change(mobileInput, { target: { value: "+1 555-019-2834" } });
      fireEvent.change(emailInput, { target: { value: "sarah@trustvault.internal" } });

      const continueBtn = screen.getByRole("button", { name: /continue to email verification/i });
      fireEvent.click(continueBtn);

      // Step 2: Email verification screen
      expect(await screen.findByText(/a verification code has been sent to your email/i)).toBeDefined();
      expect(screen.getByText(/sarah@trustvault.internal/i)).toBeDefined();

      // Enter 6 digits
      const digitInputs = screen.getAllByRole("textbox");
      expect(digitInputs.length).toBe(6);

      fireEvent.change(digitInputs[0], { target: { value: "1" } });
      fireEvent.change(digitInputs[1], { target: { value: "2" } });
      fireEvent.change(digitInputs[2], { target: { value: "3" } });
      fireEvent.change(digitInputs[3], { target: { value: "4" } });
      fireEvent.change(digitInputs[4], { target: { value: "5" } });
      fireEvent.change(digitInputs[5], { target: { value: "6" } });

      const verifyBtn = screen.getByRole("button", { name: /verify code & continue/i });
      fireEvent.click(verifyBtn);

      // Step 3: Password setup
      expect(await screen.findByText(/create enterprise password/i)).toBeDefined();
      expect(screen.getByText(/password requirements/i)).toBeDefined();
    });
  });

  describe("Single-Device Session Policy Components", () => {
    it("renders SessionReplacedNotice with warning details and re-authenticate action", () => {
      const handleReauth = vi.fn();
      render(
        <SessionReplacedNotice
          role="viewer"
          deviceInfo={{
            browser: "Firefox 128 / macOS",
            ip: "10.0.0.5",
            location: "New York, USA",
            timestamp: "2026-10-21T06:00:00Z"
          }}
          onReauthenticate={handleReauth}
        />
      );

      expect(screen.getByText(/signed in on another device/i)).toBeDefined();
      expect(screen.getByText(/single-device session alert/i)).toBeDefined();
      expect(screen.getByText(/Firefox 128 \/ macOS/i)).toBeDefined();

      const reauthBtn = screen.getByRole("button", { name: /re-authenticate this device/i });
      fireEvent.click(reauthBtn);
      expect(handleReauth).toHaveBeenCalledTimes(1);
    });

    it("renders SessionExpiredNotice with timeout reason and sign in again button", () => {
      const handleLoginAgain = vi.fn();
      render(<SessionExpiredNotice role="admin" onLoginAgain={handleLoginAgain} />);

      expect(screen.getByText(/session expired/i)).toBeDefined();
      expect(screen.getByText(/enterprise session timeout • ADMIN/i)).toBeDefined();

      const btn = screen.getByRole("button", { name: /sign in again/i });
      fireEvent.click(btn);
      expect(handleLoginAgain).toHaveBeenCalledTimes(1);
    });
  });
});
