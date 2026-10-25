import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { LoginForm } from "../components/auth/LoginForm";

function renderWithProviders(ui) {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <AuthProvider>{ui}</AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("TrustVault Role-Based Authentication Frontend Integration", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("tv_mock_mode", "true"); // for unit test runner
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("1. Admin Authentication UI & Security", () => {
    it("renders Username and Password fields when Admin role is selected", async () => {
      renderWithProviders(<LoginForm initialRole="admin" />);

      expect(screen.getByLabelText(/administrator username \/ email/i)).toBeDefined();
      expect(screen.getByLabelText(/administrator password/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /sign in as administrator/i })).toBeDefined();
    });

    it("STRICTLY DOES NOT render any Forgot Password link or button for Admin", () => {
      renderWithProviders(<LoginForm initialRole="admin" />);

      const forgotLink = screen.queryByRole("link", { name: /forgot password/i });
      expect(forgotLink).toBeNull();
      expect(screen.queryByText(/forgot password/i)).toBeNull();
    });

    it("toggles password visibility with show/hide control", () => {
      renderWithProviders(<LoginForm initialRole="admin" />);

      const passwordInput = screen.getByLabelText(/administrator password/i);
      expect(passwordInput.getAttribute("type")).toBe("password");

      const toggleBtn = screen.getByRole("button", { name: /show password/i });
      fireEvent.click(toggleBtn);

      expect(passwordInput.getAttribute("type")).toBe("text");

      const hideBtn = screen.getByRole("button", { name: /hide password/i });
      fireEvent.click(hideBtn);

      expect(passwordInput.getAttribute("type")).toBe("password");
    });

    it("displays error when submitting empty administrator username or password", async () => {
      renderWithProviders(<LoginForm initialRole="admin" />);

      const usernameInput = screen.getByLabelText(/administrator username \/ email/i);
      const passwordInput = screen.getByLabelText(/administrator password/i);
      fireEvent.change(usernameInput, { target: { value: "" } });
      fireEvent.change(passwordInput, { target: { value: "" } });

      const submitBtn = screen.getByRole("button", { name: /sign in as administrator/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/administrator username or corporate email is required/i)).toBeDefined();
      expect(await screen.findByText(/administrator password is required/i)).toBeDefined();
    });
  });

  describe("2. Owner & Viewer Firebase Passwordless Email Link Auth UI", () => {
    it("renders Email Link input for Owner role", () => {
      renderWithProviders(<LoginForm initialRole="owner" />);

      expect(screen.getByLabelText(/registered corporate email/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /send secure login link/i })).toBeDefined();
    });

    it("renders passwordless authentication form cleanly without extraneous dev notes", () => {
      renderWithProviders(<LoginForm initialRole="owner" />);

      expect(screen.getByLabelText(/registered corporate email/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /send secure login link/i })).toBeDefined();
    });

    it("validates empty email before sending login link", async () => {
      renderWithProviders(<LoginForm initialRole="owner" />);

      const submitBtn = screen.getByRole("button", { name: /send secure login link/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/email address is required/i)).toBeDefined();
    });

    it("switches smoothly between Owner and Admin roles, altering the auth method", () => {
      renderWithProviders(<LoginForm initialRole="owner" />);

      // Initially Owner: email field, no password field
      expect(screen.getByLabelText(/registered corporate email/i)).toBeDefined();
      expect(screen.queryByLabelText(/administrator password/i)).toBeNull();

      // Click Admin radio button
      const adminRadio = screen.getByRole("radio", { name: /admin/i });
      fireEvent.click(adminRadio);

      // Now Admin: password field present, NO forgot password link
      expect(screen.getByLabelText(/administrator username \/ email/i)).toBeDefined();
      expect(screen.getByLabelText(/administrator password/i)).toBeDefined();
      expect(screen.queryByRole("link", { name: /forgot password/i })).toBeNull();
    });
  });
});
