import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { TemporaryAccessProvider } from "../context/TemporaryAccessContext";
import { DashboardPage } from "../pages/DashboardPage";
import { ViewerDashboardPage } from "../pages/ViewerDashboardPage";
import { DocumentDetailsPage } from "../pages/DocumentDetailsPage";
import { AppRoutes } from "../routes/AppRoutes";
import * as api from "../services/api";

const mockOwnerUser = {
  id: 2,
  name: "Jane Doe (Owner)",
  email: "jane.owner@trustvault.internal",
  role: "owner"
};

const mockAdminUser = {
  id: 1,
  name: "Alex Vance (Admin)",
  email: "admin@trustvault.internal",
  role: "admin"
};

const mockViewerUser = {
  id: 3,
  name: "Bob Smith (Viewer)",
  email: "bob.viewer@trustvault.internal",
  role: "viewer"
};

const sampleDocs = [
  {
    id: 101,
    name: "Security_Architecture_v2.pdf",
    category: "Security",
    size_bytes: 1887436,
    owner_id: 2,
    owner_name: "Jane Doe",
    created_at: "2026-10-18T14:20:00Z"
  },
  {
    id: 102,
    name: "Snovasys_Hiring_Specs.pdf",
    category: "Engineering",
    size_bytes: 2457600,
    owner_id: 2,
    owner_name: "Jane Doe",
    created_at: "2026-10-18T14:20:00Z"
  }
];

describe("TrustVault — Role-Specific Dashboards & Download Permissions", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("1. Strict Removal of Download for Owner and Admin", () => {
    it("Owner dashboard does NOT render any Download button for documents", async () => {
      vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: sampleDocs, total: 2 });
      vi.spyOn(api, "apiGetOwnerActivity").mockResolvedValue({ activity: [], total: 0 });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: mockOwnerUser,
              role: "owner",
              isOwner: true,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <DashboardPage />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Security_Architecture_v2.pdf")).toBeTruthy();
      });

      // Assert NO button with text "Download" or title containing "Download"
      const downloadButtons = screen.queryAllByRole("button", { name: /download/i });
      expect(downloadButtons).toHaveLength(0);
    });

    it("DocumentDetailsPage does NOT render Download Document button for Owner", async () => {
      vi.spyOn(api, "apiGetDocument").mockResolvedValue({
        document: { ...sampleDocs[0], access_level: "owner" }
      });
      vi.spyOn(api, "apiGetPermissions").mockResolvedValue({ permissions: [] });

      render(
        <MemoryRouter initialEntries={["/documents/101"]}>
          <AuthContext.Provider
            value={{
              user: mockOwnerUser,
              role: "owner",
              isOwner: true,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <DocumentDetailsPage />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Security_Architecture_v2.pdf")).toBeTruthy();
      });

      expect(screen.queryByRole("button", { name: /download document/i })).toBeNull();
      // But Owner can see Permissions and Edit Metadata
      expect(screen.getByText("Permissions")).toBeTruthy();
      expect(screen.getByText("Edit Metadata")).toBeTruthy();
    });

    it("DocumentDetailsPage does NOT render Download Document button for Admin", async () => {
      vi.spyOn(api, "apiGetDocument").mockResolvedValue({
        document: { ...sampleDocs[0], access_level: "read" }
      });

      render(
        <MemoryRouter initialEntries={["/documents/101"]}>
          <AuthContext.Provider
            value={{
              user: mockAdminUser,
              role: "admin",
              isOwner: false,
              isAdmin: true,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <DocumentDetailsPage />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Security_Architecture_v2.pdf")).toBeTruthy();
      });

      expect(screen.queryByRole("button", { name: /download document/i })).toBeNull();
    });
  });

  describe("2. Dedicated Viewer Dashboard & Download Feature", () => {
    it("renders Viewer Dashboard with metric cards and assigned documents", async () => {
      vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: sampleDocs, total: 2 });
      vi.spyOn(api, "apiGetDownloadHistory").mockResolvedValue({
        downloads: [
          {
            id: 1,
            document_id: 101,
            document_name: "Security_Architecture_v2.pdf",
            downloaded_at: "2026-10-19T10:00:00Z"
          }
        ]
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: mockViewerUser,
              role: "viewer",
              isOwner: false,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <ViewerDashboardPage />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("Welcome, Bob Smith (Viewer)")).toBeTruthy();
        expect(screen.getByText("Viewer Access Portal")).toBeTruthy();
      });

      // Verify Viewer DOES have View (Eye) buttons and does NOT have Download buttons
      const viewButtons = screen.getAllByRole("button", { name: /view/i });
      expect(viewButtons.length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /download/i })).toBeNull();

      // Verify Viewer does NOT have Owner management buttons
      expect(screen.queryByText(/upload document/i)).toBeNull();
      expect(screen.queryByTitle(/manage permissions/i)).toBeNull();
    });

    it("triggers in-app view when Viewer clicks View button", async () => {
      vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: [sampleDocs[0]], total: 1 });
      vi.spyOn(api, "apiGetDownloadHistory").mockResolvedValue({ downloads: [] });
      const previewSpy = vi.spyOn(api, "apiPreviewDocument").mockResolvedValue({
        blob: new Blob(["sample decrypted content"], { type: "application/pdf" }),
        blobUrl: "blob:mock-preview-url",
        mimeType: "application/pdf"
      });

      render(
        <MemoryRouter>
          <AuthContext.Provider
            value={{
              user: mockViewerUser,
              role: "viewer",
              isOwner: false,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <ViewerDashboardPage />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getAllByText("Security_Architecture_v2.pdf").length).toBeGreaterThan(0);
      });

      const viewBtn = screen.getAllByRole("button", { name: /view/i })[0];
      fireEvent.click(viewBtn);

      await waitFor(() => {
        expect(previewSpy).toHaveBeenCalledWith(101);
      });
    });
  });

  describe("3. Strict Role-Specific Landing / Routing Separation", () => {
    it("renders Landing Page with Viewer dashboard link from root / and navigates to /viewer/dashboard", async () => {
      vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: [], total: 0 });
      vi.spyOn(api, "apiGetDownloadHistory").mockResolvedValue({ downloads: [] });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AuthContext.Provider
            value={{
              user: mockViewerUser,
              role: "viewer",
              isOwner: false,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Verify Landing Page renders rather than auto-redirecting to dashboard
      await waitFor(() => {
        expect(screen.getByText("Your Documents. Your Control. Your TrustVault.")).toBeTruthy();
      });

      const dashboardBtn = document.getElementById("landing-dashboard-btn");
      expect(dashboardBtn).toBeTruthy();
      expect(dashboardBtn.getAttribute("href")).toBe("/viewer/dashboard");

      fireEvent.click(dashboardBtn);

      await waitFor(() => {
        expect(screen.getByText("Viewer Access Portal")).toBeTruthy();
      });
    });

    it("renders Landing Page with Owner dashboard link from root / and navigates to /dashboard", async () => {
      vi.spyOn(api, "apiGetDocuments").mockResolvedValue({ documents: [], total: 0 });
      vi.spyOn(api, "apiGetOwnerActivity").mockResolvedValue({ activity: [], total: 0 });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AuthContext.Provider
            value={{
              user: mockOwnerUser,
              role: "owner",
              isOwner: true,
              isAdmin: false,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Verify Landing Page renders rather than auto-redirecting to dashboard
      await waitFor(() => {
        expect(screen.getByText("Your Documents. Your Control. Your TrustVault.")).toBeTruthy();
      });

      const dashboardBtn = document.getElementById("landing-dashboard-btn");
      expect(dashboardBtn).toBeTruthy();
      expect(dashboardBtn.getAttribute("href")).toBe("/dashboard");

      fireEvent.click(dashboardBtn);

      await waitFor(() => {
        expect(screen.getByText("Document Owner Portal")).toBeTruthy();
      });
    });

    it("renders Landing Page with Admin dashboard link from root / and navigates to /admin", async () => {
      vi.spyOn(api, "apiGetAdminStats").mockResolvedValue({
        stats: { totalUsers: 10, totalDocs: 20 }
      });
      vi.spyOn(api, "apiGetAdminDocuments").mockResolvedValue({ documents: [] });
      vi.spyOn(api, "apiGetAuditLogs").mockResolvedValue({ logs: [] });
      vi.spyOn(api, "apiGetAdminComplaints").mockResolvedValue({ complaints: [] });

      render(
        <MemoryRouter initialEntries={["/"]}>
          <AuthContext.Provider
            value={{
              user: mockAdminUser,
              role: "admin",
              isOwner: false,
              isAdmin: true,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Verify Landing Page renders rather than auto-redirecting to dashboard
      await waitFor(() => {
        expect(screen.getByText("Your Documents. Your Control. Your TrustVault.")).toBeTruthy();
      });

      const dashboardBtn = document.getElementById("landing-dashboard-btn");
      expect(dashboardBtn).toBeTruthy();
      expect(dashboardBtn.getAttribute("href")).toBe("/admin");

      fireEvent.click(dashboardBtn);

      await waitFor(() => {
        expect(screen.getByText("Admin Console")).toBeTruthy();
      });
    });

    it("denies Admin access to Owner /dashboard", async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthContext.Provider
            value={{
              user: mockAdminUser,
              role: "admin",
              isOwner: false,
              isAdmin: true,
              loading: false,
              isAuthenticated: true,
              hasAcceptedTerms: true
            }}
          >
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText("403 Access Denied Screen")).toBeTruthy();
      });
    });
  });
});
