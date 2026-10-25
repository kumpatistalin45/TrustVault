import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ThemeProvider, useTheme } from "../context/ThemeContext";
import { ToastContext } from "../context/ToastContext";
import { ProtectedRoute } from "../routes/AppRoutes";
import { TermsPage } from "../pages/TermsPage";
import { SettingsPage } from "../pages/SettingsPage";
import { HelpPage } from "../pages/HelpPage";
import { PrivacyPolicyPage } from "../pages/PrivacyPolicyPage";
import { UserAvatar, getInitials } from "../components/common/UserAvatar";
import { CURRENT_TERMS_VERSION } from "../services/api";

const mockToast = {
  showToast: vi.fn(),
  removeToast: vi.fn()
};

function renderWithContext(ui, authOverrides = {}, route = "/") {
  const defaultAuth = {
    user: { id: 101, name: "Jane Doe", email: "jane@trustvault.internal", role: "viewer" },
    isAuthenticated: true,
    loading: false,
    role: "viewer",
    isAdmin: false,
    hasAcceptedTerms: true,
    termsLoading: false,
    termsVersion: CURRENT_TERMS_VERSION,
    acceptTerms: vi.fn().mockResolvedValue({ success: true, version: CURRENT_TERMS_VERSION }),
    checkTerms: vi.fn(),
    logout: vi.fn(),
    updateUser: vi.fn(),
    ...authOverrides
  };

  return render(
    <ToastContext.Provider value={mockToast}>
      <ThemeProvider>
        <AuthContext.Provider value={defaultAuth}>
          <MemoryRouter initialEntries={[route]}>
            {ui}
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>
    </ToastContext.Provider>
  );
}

describe("TrustVault Phase 2 UI Enhancements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("A. User Avatar and Fallback Generator", () => {
    it("generates correct initials from user's full name", () => {
      expect(getInitials("Jane Doe")).toBe("JD");
      expect(getInitials("Alex")).toBe("AL");
      expect(getInitials("Bob Smith Junior")).toBe("BJ");
      expect(getInitials("")).toBe("U");
      expect(getInitials(null)).toBe("U");
    });

    it("renders initials fallback when no photo url is provided", () => {
      render(<UserAvatar user={{ name: "Sarah Connor" }} size={40} />);
      expect(screen.getByText("SC")).toBeDefined();
    });

    it("renders image avatar when avatar_url is provided", () => {
      render(
        <UserAvatar
          user={{ name: "John Wick", avatar_url: "https://example.com/avatar.jpg" }}
          size={40}
        />
      );
      const img = screen.getByRole("img");
      expect(img.getAttribute("src")).toBe("https://example.com/avatar.jpg");
    });
  });

  describe("B. Theme Management (Light, Dark, System)", () => {
    function ThemeTestComponent() {
      const { theme, setTheme, resolvedTheme } = useTheme();
      return (
        <div>
          <span data-testid="theme">{theme}</span>
          <span data-testid="resolved">{resolvedTheme}</span>
          <button onClick={() => setTheme("dark")}>Set Dark</button>
          <button onClick={() => setTheme("light")}>Set Light</button>
        </div>
      );
    }

    it("toggles and persists theme to localStorage and sets data-theme on document", () => {
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      );

      const darkBtn = screen.getByText("Set Dark");
      fireEvent.click(darkBtn);

      expect(localStorage.getItem("tv_theme")).toBe("dark");
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

      const lightBtn = screen.getByText("Set Light");
      fireEvent.click(lightBtn);

      expect(localStorage.getItem("tv_theme")).toBe("light");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
  });

  describe("D. Mandatory Terms & Conditions Acceptance Flow", () => {
    it("redirects authenticated user to /terms when hasAcceptedTerms is false", () => {
      render(
        <AuthContext.Provider
          value={{
            isAuthenticated: true,
            loading: false,
            hasAcceptedTerms: false
          }}
        >
          <MemoryRouter initialEntries={["/dashboard"]}>
            <Routes>
              <Route path="/terms" element={<div>Terms Gate Screen</div>} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <div>Secret Protected Content</div>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      );

      expect(screen.getByText("Terms Gate Screen")).toBeDefined();
      expect(screen.queryByText("Secret Protected Content")).toBeNull();
    });

    it("keeps accept button disabled until the agreement checkbox is checked", () => {
      renderWithContext(<TermsPage />, {}, "/terms");

      const acceptBtn = screen.getByRole("button", { name: /accept & continue/i });
      expect(acceptBtn.disabled).toBe(true);

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      expect(acceptBtn.disabled).toBe(false);
    });

    it("displays inline red error when terms acceptance call rejects", async () => {
      const mockFailingAccept = vi.fn().mockRejectedValue(new Error("Database connection refused"));
      renderWithContext(<TermsPage />, { acceptTerms: mockFailingAccept }, "/terms");

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      const acceptBtn = screen.getByRole("button", { name: /accept & continue/i });
      fireEvent.click(acceptBtn);

      expect(await screen.findByText(/database connection refused/i)).toBeDefined();
    });

    it("calls acceptTerms and navigates on successful acceptance", async () => {
      const mockAccept = vi.fn().mockResolvedValue({ success: true, version: CURRENT_TERMS_VERSION });
      renderWithContext(<TermsPage />, { acceptTerms: mockAccept }, "/terms");

      const checkbox = screen.getByRole("checkbox");
      fireEvent.click(checkbox);

      const acceptBtn = screen.getByRole("button", { name: /accept & continue/i });
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(mockAccept).toHaveBeenCalled();
      });
    });

    it("calls logout when user clicks Decline & Sign Out", () => {
      const mockLogout = vi.fn();
      renderWithContext(<TermsPage />, { logout: mockLogout }, "/terms");

      const declineBtn = screen.getByRole("button", { name: /decline & sign out/i });
      fireEvent.click(declineBtn);

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe("Help & Support Module", () => {
    it("renders FAQ and switches to Raise Complaint form", () => {
      renderWithContext(<HelpPage />);

      expect(screen.getByText(/knowledge base & faqs/i)).toBeDefined();
      const raiseTab = screen.getByRole("button", { name: /raise a complaint/i });
      fireEvent.click(raiseTab);

      expect(screen.getByText(/raise a formal complaint/i)).toBeDefined();
      expect(screen.getByText(/security protocol warning/i)).toBeDefined();
    });

    it("validates required fields in Raise Complaint form", async () => {
      renderWithContext(<HelpPage />);

      const raiseTab = screen.getByRole("button", { name: /raise a complaint/i });
      fireEvent.click(raiseTab);

      const submitBtn = screen.getByRole("button", { name: /submit complaint/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/subject line is required/i)).toBeDefined();
    });

    it("rejects file attachments larger than 5MB", () => {
      renderWithContext(<HelpPage />);

      const raiseTab = screen.getByRole("button", { name: /raise a complaint/i });
      fireEvent.click(raiseTab);

      const fileInput = document.querySelector('input[type="file"]');
      const largeFile = new File(["dummy content"], "large_log.txt", { type: "text/plain" });
      Object.defineProperty(largeFile, "size", { value: 6 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      expect(screen.getByText(/attachment exceeds the maximum allowed size of 5 mb/i)).toBeDefined();
    });
  });

  describe("Settings & Privacy Policy Pages", () => {
    it("renders Settings page with Appearance, Accessibility, and Notifications", () => {
      renderWithContext(<SettingsPage />);

      expect(screen.getByText(/theme & appearance/i)).toBeDefined();
      expect(screen.getByText(/accessibility & layout/i)).toBeDefined();
      expect(screen.getByText(/notification preferences/i)).toBeDefined();
      expect(screen.getByText(/account & session details/i)).toBeDefined();
    });

    it("renders Privacy Policy with verified disclosures and draft notice", () => {
      renderWithContext(<PrivacyPolicyPage />);

      expect(screen.getByText(/draft document for corporate review/i)).toBeDefined();
      expect(screen.getByText(/1\. account credentials & personal identity data/i)).toBeDefined();
      expect(screen.getByText(/2\. document metadata & aes-256-gcm envelope protection/i)).toBeDefined();
    });
  });
});
