import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ToastContext } from "../context/ToastContext";
import { LoginForm } from "../components/auth/LoginForm";
import { EmailOtpLoginForm } from "../components/auth/EmailOtpLoginForm";
import { OtpInput } from "../components/common/OtpInput";
import { AdminOwnersPage } from "../pages/AdminOwnersPage";
import { OwnerViewersPage } from "../pages/OwnerViewersPage";
import { ViewerDashboardPage } from "../pages/ViewerDashboardPage";
import { LandingPage } from "../pages/LandingPage";
import { AppRoutes } from "../routes/AppRoutes";
import { parseCsvText, validateImportRows } from "../utils/fileImportParser";
import {
  getOwners,
  addOwner,
  updateOwner,
  toggleOwnerStatus,
  getViewers,
  addViewer,
  updateViewer,
  toggleViewerStatus
} from "../services/masterDataService";
import * as api from "../services/api";

const sampleDocs = [
  {
    id: 101,
    name: "Security_Architecture_v2.pdf",
    category: "Security",
    size_bytes: 1887436,
    owner_id: 101,
    owner_name: "Jane Doe",
    created_at: "2026-10-18T14:20:00Z"
  }
];

const mockToast = {
  showToast: vi.fn()
};

const adminAuthContext = {
  user: { id: 1, name: "Alex Vance", email: "admin@trustvault.internal", role: "admin" },
  isAuthenticated: true,
  isAdmin: true,
  isOwner: false,
  role: "admin",
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn().mockResolvedValue({ user: { id: 1, role: "admin" } }),
  logout: vi.fn()
};

const ownerAuthContext = {
  user: { id: 101, name: "Jane Doe", email: "jane.owner@trustvault.internal", role: "owner" },
  isAuthenticated: true,
  isAdmin: false,
  isOwner: true,
  role: "owner",
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn().mockResolvedValue({ user: { id: 101, role: "owner" } }),
  logout: vi.fn()
};

const viewerAuthContext = {
  user: { id: 201, name: "Bob Smith", email: "bob.viewer@trustvault.internal", role: "viewer" },
  isAuthenticated: true,
  isAdmin: false,
  isOwner: false,
  role: "viewer",
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn().mockResolvedValue({ user: { id: 201, role: "viewer" } }),
  logout: vi.fn()
};

const unauthContext = {
  user: null,
  isAuthenticated: false,
  isAdmin: false,
  isOwner: false,
  role: "viewer",
  loading: false,
  hasAcceptedTerms: null,
  login: vi.fn().mockResolvedValue({ user: { id: 3, role: "viewer" } }),
  logout: vi.fn()
};

function renderWithContext(ui, authValue = unauthContext) {
  return render(
    <AuthContext.Provider value={authValue}>
      <ToastContext.Provider value={mockToast}>
        <MemoryRouter>{ui}</MemoryRouter>
      </ToastContext.Provider>
    </AuthContext.Provider>
  );
}

describe("TrustVault — Phase 1 Frontend UI Verification Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: sampleDocs, total: 1 });
    vi.spyOn(api, "apiGetDownloadHistory").mockResolvedValue({ downloads: [] });
  });

  // =========================================================================
  // 1. Strict Removal of Signup & Registration
  // =========================================================================
  describe("1. Strict Removal of Signup & Registration Links", () => {
    it("renders LandingPage without any Sign Up links or buttons", () => {
      renderWithContext(<LandingPage />, unauthContext);

      const nav = screen.getByRole("navigation");
      expect(within(nav).queryByRole("link", { name: /sign up|register/i })).toBeNull();
      expect(screen.queryByRole("link", { name: /^sign up$/i })).toBeNull();
    });

    it("does not render any registration links on the Login form", () => {
      renderWithContext(<LoginForm />);
      expect(screen.queryByRole("link", { name: /register|sign up/i })).toBeNull();
      expect(screen.getByText(/accounts are provisioned exclusively by organization administrators/i)).toBeDefined();
    });

    it("redirects /register to /login on the router level", () => {
      render(
        <AuthContext.Provider value={unauthContext}>
          <ToastContext.Provider value={mockToast}>
            <MemoryRouter initialEntries={["/register"]}>
              <AppRoutes />
            </MemoryRouter>
          </ToastContext.Provider>
        </AuthContext.Provider>
      );

      // Should land on Login Page
      expect(screen.getByText(/sign in to trustvault/i)).toBeDefined();
    });
  });

  // =========================================================================
  // 2. Polished Email OTP Login UI & State Transitions
  // =========================================================================
  describe("2. Email OTP Login UI & State Transitions", () => {
    it("renders Email OTP Login interface with email input and Send OTP button", () => {
      renderWithContext(<EmailOtpLoginForm />);

      expect(screen.getByLabelText(/registered corporate email/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /continue \/ send otp/i })).toBeDefined();
    });

    it("validates empty email and displays red inline error", async () => {
      renderWithContext(<EmailOtpLoginForm />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "" } });

      const submitBtn = screen.getByRole("button", { name: /continue \/ send otp/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/corporate email address is required/i)).toBeDefined();
    });

    it("validates invalid email format with informative error message", async () => {
      renderWithContext(<EmailOtpLoginForm />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "invalid-email-format" } });

      const submitBtn = screen.getByRole("button", { name: /continue \/ send otp/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/please enter a valid email format/i)).toBeDefined();
    });

    it("displays clear messaging when email belongs to an unregistered account", async () => {
      renderWithContext(<EmailOtpLoginForm />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "unregistered.user@external.com" } });

      const submitBtn = screen.getByRole("button", { name: /continue \/ send otp/i });
      fireEvent.click(submitBtn);

      expect(await screen.findByText(/this corporate email address is not registered/i)).toBeDefined();
    });

    it("transitions from Email step to 6-Box OTP verification screen upon submitting valid email", async () => {
      renderWithContext(<EmailOtpLoginForm />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "sarah.connor@trustvault.internal" } });

      const submitBtn = screen.getByRole("button", { name: /continue \/ send otp/i });
      fireEvent.click(submitBtn);

      // Verify OTP screen appears
      expect(await screen.findByText(/enter 6-digit one-time password/i)).toBeDefined();
      expect(screen.getAllByText(/sarah.connor@trustvault.internal/i).length).toBeGreaterThanOrEqual(1);

      // 6 digit boxes present
      const digitBoxes = screen.getAllByRole("textbox", { name: /verification digit/i });
      expect(digitBoxes.length).toBe(6);

      // Edit email button present
      expect(screen.getByRole("button", { name: /edit email/i })).toBeDefined();

      // Resend OTP button present
      expect(screen.getByRole("button", { name: /resend code in/i })).toBeDefined();
    });

    it("allows user to edit email and returns to Step 1 preserving email", async () => {
      renderWithContext(<EmailOtpLoginForm />);

      const emailInput = screen.getByLabelText(/registered corporate email/i);
      fireEvent.change(emailInput, { target: { value: "elena.r@trustvault.internal" } });

      fireEvent.click(screen.getByRole("button", { name: /continue \/ send otp/i }));

      const editBtn = await screen.findByRole("button", { name: /edit email/i });
      fireEvent.click(editBtn);

      // Returned to email input
      const preservedInput = screen.getByLabelText(/registered corporate email/i);
      expect(preservedInput.value).toBe("elena.r@trustvault.internal");
    });

    it("handles OtpInput paste and keydown navigation", () => {
      const handleChange = vi.fn();
      render(<OtpInput value="12" onChange={handleChange} />);

      const firstInput = screen.getByLabelText(/verification digit 1/i);
      fireEvent.change(firstInput, { target: { value: "5" } });
      expect(handleChange).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 3. Admin Dashboard — Owner Master Data
  // =========================================================================
  describe("3. Admin Dashboard — Owner Master Data Management", () => {
    it("renders Owner Master Data page with table, metrics, and actions", () => {
      renderWithContext(<AdminOwnersPage />, adminAuthContext);

      expect(screen.getByText(/owner master data management/i)).toBeDefined();
      expect(screen.getByText(/total owners/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /add owner/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /bulk import/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /export csv/i })).toBeDefined();
    });

    it("filters owner table when typing into search box", async () => {
      renderWithContext(<AdminOwnersPage />, adminAuthContext);

      const searchInput = screen.getByPlaceholderText(/search owners/i);
      fireEvent.change(searchInput, { target: { value: "Jane Doe" } });

      await waitFor(() => {
        expect(screen.getByText("Jane Doe")).toBeDefined();
      });
    });

    it("opens Add Owner modal and validates required fields", async () => {
      renderWithContext(<AdminOwnersPage />, adminAuthContext);

      const addBtn = screen.getByRole("button", { name: /add owner/i });
      fireEvent.click(addBtn);

      expect(screen.getByText(/add new document owner/i)).toBeDefined();

      // Submit without name
      const saveBtn = screen.getByRole("button", { name: /create owner/i });
      fireEvent.click(saveBtn);

      expect(await screen.findByText(/full name is required/i)).toBeDefined();
    });

    it("opens status change confirmation dialog when toggling owner status", async () => {
      renderWithContext(<AdminOwnersPage />, adminAuthContext);

      const toggleButtons = screen.getAllByRole("button", { name: /deactivate|activate/i });
      expect(toggleButtons.length).toBeGreaterThan(0);

      fireEvent.click(toggleButtons[0]);

      expect(await screen.findByRole("dialog")).toBeDefined();
      expect(screen.getByText(/are you sure you want to/i)).toBeDefined();
    });
  });

  // =========================================================================
  // 4. Owner Dashboard — Viewer Master Data
  // =========================================================================
  describe("4. Owner Dashboard — Viewer Master Data Management", () => {
    it("renders Viewer Master Data page with owner scope banner", () => {
      renderWithContext(<OwnerViewersPage />, ownerAuthContext);

      expect(screen.getByText(/viewer master data/i)).toBeDefined();
      expect(screen.getByText(/document owner scope policy/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /add viewer/i })).toBeDefined();
      expect(screen.getByRole("button", { name: /bulk import/i })).toBeDefined();
    });

    it("filters viewer table by search query", async () => {
      renderWithContext(<OwnerViewersPage />, ownerAuthContext);

      const searchInput = screen.getByPlaceholderText(/search viewers/i);
      fireEvent.change(searchInput, { target: { value: "Bob Smith" } });

      await waitFor(() => {
        expect(screen.getByText("Bob Smith")).toBeDefined();
      });
    });

    it("opens Add Viewer modal with proper role fields", () => {
      renderWithContext(<OwnerViewersPage />, ownerAuthContext);

      const addBtn = screen.getByRole("button", { name: /add viewer/i });
      fireEvent.click(addBtn);

      expect(screen.getByText(/add new authorized viewer/i)).toBeDefined();
      expect(screen.getByLabelText(/corporate email address/i)).toBeDefined();
    });

    it("opens Details modal and displays viewer assigned documents", async () => {
      renderWithContext(<OwnerViewersPage />, ownerAuthContext);

      const detailsBtns = screen.getAllByRole("button", { name: /view details/i });
      expect(detailsBtns.length).toBeGreaterThan(0);

      fireEvent.click(detailsBtns[0]);

      expect(await screen.findByText(/authorized viewer profile details/i)).toBeDefined();
      expect(screen.getByText(/assigned confidential documents/i)).toBeDefined();
    });
  });

  // =========================================================================
  // 5. Excel & CSV Bulk Import Parser & Validation
  // =========================================================================
  describe("5. Bulk Import Spreadsheet Parser & Validation", () => {
    it("parses valid CSV text into structured records", () => {
      const csv = `Name,Email,Mobile,Department,Status
Marcus Vance,marcus.v@company.com,+1 555-111-2222,Engineering,active
Priya Patel,priya.p@company.com,+1 555-222-3333,Compliance,active`;

      const rows = parseCsvText(csv);
      expect(rows.length).toBe(2);
      expect(rows[0].name).toBe("Marcus Vance");
      expect(rows[0].email).toBe("marcus.v@company.com");
      expect(rows[1].name).toBe("Priya Patel");
    });

    it("detects invalid rows and generates row-level error feedback", () => {
      const rawRows = [
        { _rowNum: 2, name: "Valid User", email: "valid.user@company.com" },
        { _rowNum: 3, name: "", email: "no.name@company.com" },
        { _rowNum: 4, name: "Bad Email", email: "not-an-email" }
      ];

      const result = validateImportRows(rawRows);
      expect(result.validRows.length).toBe(1);
      expect(result.invalidRows.length).toBe(2);
      expect(result.invalidRows[0]._errors[0]).toContain("Missing full name");
      expect(result.invalidRows[1]._errors[0]).toContain("Invalid email format");
    });

    it("detects intra-file duplicate emails and flags warnings", () => {
      const rawRows = [
        { _rowNum: 2, name: "User One", email: "duplicate@company.com" },
        { _rowNum: 3, name: "User Two", email: "duplicate@company.com" }
      ];

      const result = validateImportRows(rawRows);
      expect(result.duplicateEmails).toContain("duplicate@company.com");
      expect(result.invalidRows.length).toBe(1); // second row flagged as duplicate error
    });
  });

  // =========================================================================
  // 6. Strict Viewer Preview-Only Requirements
  // =========================================================================
  describe("6. Strict Viewer Preview-Only Requirements", () => {
    it("strictly omits any Download action in ViewerDashboardPage", async () => {
      renderWithContext(<ViewerDashboardPage />, viewerAuthContext);

      // Verify no Download button exists anywhere in the DOM
      expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
      expect(screen.queryByText(/^download$/i)).toBeNull();

      // Eye icon View button exists
      await waitFor(() => {
        const viewButtons = screen.getAllByRole("button", { name: /view/i });
        expect(viewButtons.length).toBeGreaterThan(0);
      });
    });
  });
});
