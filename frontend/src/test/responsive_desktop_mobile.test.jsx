import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ThemeProvider } from "../context/ThemeContext";
import { ToastProvider } from "../context/ToastContext";
import { TemporaryAccessProvider } from "../context/TemporaryAccessContext";
import { AppShell } from "../components/layout/AppShell";
import { Header } from "../components/layout/Header";
import { Sidebar } from "../components/layout/Sidebar";
import { RoleSelector } from "../components/auth/RoleSelector";
import { OtpModal } from "../components/common/OtpModal";
import { Modal } from "../components/common/Modal";

describe("TrustVault — Desktop + Mobile Responsive Design System", () => {
  const mockUserViewer = { id: 1, name: "Alice Viewer", email: "alice@company.com", role: "viewer" };
  const mockUserOwner = { id: 2, name: "Bob Owner", email: "bob@company.com", role: "owner" };
  const mockUserAdmin = { id: 3, name: "Charlie Admin", email: "charlie@company.com", role: "admin" };

  const renderWithProviders = (ui, authValue = {}) => {
    const defaultAuth = {
      user: mockUserViewer,
      role: "viewer",
      isOwner: false,
      isAdmin: false,
      isAuthenticated: true,
      logout: vi.fn(),
      ...authValue
    };

    return render(
      <MemoryRouter>
        <ThemeProvider>
          <ToastProvider>
            <TemporaryAccessProvider>
              <AuthContext.Provider value={defaultAuth}>
                {ui}
              </AuthContext.Provider>
            </TemporaryAccessProvider>
          </ToastProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  describe("1. Mobile Navigation Drawer & Hamburger Toggle", () => {
    it("renders hamburger toggle button in Header with accessible label", () => {
      const onToggle = vi.fn();
      renderWithProviders(<Header onToggleSidebar={onToggle} isSidebarOpen={false} />);
      
      const toggleBtn = screen.getByLabelText(/toggle navigation drawer/i);
      expect(toggleBtn).toBeDefined();
      expect(toggleBtn.className).toContain("sidebar-toggle-btn");
      
      fireEvent.click(toggleBtn);
      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it("renders Sidebar in mobile-open state with backdrop overlay when isOpen=true", () => {
      const onClose = vi.fn();
      const { container } = renderWithProviders(<Sidebar isOpen={true} onClose={onClose} />);
      
      const aside = container.querySelector("aside");
      expect(aside.className).toContain("sidebar-mobile-open");
      
      // Backdrop overlay exists and can be clicked to close
      const backdrop = aside.previousSibling;
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalled();
    });

    it("renders Sidebar in desktop state when isOpen=false", () => {
      const { container } = renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />);
      const aside = container.querySelector("aside");
      expect(aside.className).toContain("sidebar-desktop");
    });
  });

  describe("2. All Three Role-Based Themes", () => {
    it("applies data-role='viewer' for Viewer role", () => {
      const { container } = renderWithProviders(<AppShell />, {
        user: mockUserViewer,
        role: "viewer"
      });
      const shell = container.firstChild;
      expect(shell.getAttribute("data-role")).toBe("viewer");
    });

    it("applies data-role='owner' for Document Owner role (Teal/Emerald theme)", () => {
      const { container } = renderWithProviders(<AppShell />, {
        user: mockUserOwner,
        role: "owner",
        isOwner: true
      });
      const shell = container.firstChild;
      expect(shell.getAttribute("data-role")).toBe("owner");
    });

    it("applies data-role='admin' for System Admin role (Navy/Violet theme)", () => {
      const { container } = renderWithProviders(<AppShell />, {
        user: mockUserAdmin,
        role: "admin",
        isAdmin: true
      });
      const shell = container.firstChild;
      expect(shell.getAttribute("data-role")).toBe("admin");
    });
  });

  describe("3. Mobile Touch Targets & Role Selector Stacking", () => {
    it("renders RoleSelector with role-selector-grid and role-selector-btn classes", () => {
      const onSelect = vi.fn();
      const { container } = renderWithProviders(
        <RoleSelector selectedRole="viewer" onSelectRole={onSelect} />
      );

      const grid = container.querySelector(".role-selector-grid");
      expect(grid).not.toBeNull();

      const buttons = container.querySelectorAll(".role-selector-btn");
      expect(buttons.length).toBe(3);

      const descriptions = container.querySelectorAll(".role-selector-desc");
      expect(descriptions.length).toBe(3);
    });

    it("allows switching roles via RoleSelector", () => {
      const onSelect = vi.fn();
      renderWithProviders(
        <RoleSelector selectedRole="viewer" onSelectRole={onSelect} />
      );

      const ownerBtn = screen.getByRole("radio", { name: /owner/i });
      fireEvent.click(ownerBtn);
      expect(onSelect).toHaveBeenCalledWith("owner");
    });
  });

  describe("4. Responsive OTP Inputs & Modal Dialogs", () => {
    it("renders OtpModal with otp-input-group and responsive otp-digit-input boxes", () => {
      const { container } = renderWithProviders(
        <OtpModal isOpen={true} onClose={vi.fn()} onVerify={vi.fn()} />
      );

      const inputGroup = container.querySelector(".otp-input-group");
      expect(inputGroup).not.toBeNull();

      const digitInputs = container.querySelectorAll(".otp-digit-input");
      expect(digitInputs.length).toBe(6);
    });

    it("renders Modal with modal-dialog, modal-header, and modal-body for mobile padding", () => {
      const { container } = renderWithProviders(
        <Modal isOpen={true} onClose={vi.fn()} title="Test Dialog">
          <div>Dialog Content</div>
        </Modal>
      );

      expect(container.querySelector(".modal-dialog")).not.toBeNull();
      expect(container.querySelector(".modal-header")).not.toBeNull();
      expect(container.querySelector(".modal-body")).not.toBeNull();
      expect(screen.getByText("Dialog Content")).toBeDefined();
    });
  });

  describe("5. Viewport Adaptation Verification", () => {
    const viewports = [
      { name: "Mobile Ultra-compact", width: 320, height: 568 },
      { name: "Mobile Android Standard", width: 360, height: 780 },
      { name: "Mobile iPhone SE", width: 375, height: 667 },
      { name: "Mobile iPhone 14/15", width: 390, height: 844 },
      { name: "Mobile iPhone Pro Max", width: 430, height: 932 },
      { name: "Tablet iPad Mini", width: 768, height: 1024 },
      { name: "Laptop Standard", width: 1024, height: 768 },
      { name: "Laptop Wide", width: 1366, height: 768 },
      { name: "Desktop Widescreen", width: 1440, height: 900 }
    ];

    viewports.forEach(({ name, width, height }) => {
      it(`renders Header and AppShell cleanly at ${name} (${width}px x ${height}px)`, () => {
        window.innerWidth = width;
        window.innerHeight = height;
        window.dispatchEvent(new Event("resize"));

        const { container } = renderWithProviders(<AppShell />);
        expect(container.querySelector(".app-main-content")).not.toBeNull();
        expect(container.querySelector(".app-header-container")).not.toBeNull();
      });
    });
  });
});
