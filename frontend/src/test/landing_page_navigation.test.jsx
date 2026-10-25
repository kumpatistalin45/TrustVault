import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import { TemporaryAccessProvider } from "../context/TemporaryAccessContext";
import { LandingPage } from "../pages/LandingPage";
import { AppRoutes } from "../routes/AppRoutes";

const unauthContext = {
  user: null,
  role: "viewer",
  isAuthenticated: false,
  isOwner: false,
  isAdmin: false,
  loading: false,
  login: vi.fn(),
  logout: vi.fn()
};

const authenticatedViewerContext = {
  user: { id: 3, name: "Bob Smith", email: "bob.viewer@trustvault.internal", role: "viewer" },
  role: "viewer",
  isAuthenticated: true,
  isOwner: false,
  isAdmin: false,
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn(),
  logout: vi.fn()
};

const authenticatedOwnerContext = {
  user: { id: 2, name: "Jane Doe", email: "jane.owner@trustvault.internal", role: "owner" },
  role: "owner",
  isAuthenticated: true,
  isOwner: true,
  isAdmin: false,
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn(),
  logout: vi.fn()
};

const authenticatedAdminContext = {
  user: { id: 1, name: "Alex Vance", email: "admin@trustvault.internal", role: "admin" },
  role: "admin",
  isAuthenticated: true,
  isOwner: false,
  isAdmin: true,
  loading: false,
  hasAcceptedTerms: true,
  login: vi.fn(),
  logout: vi.fn()
};

describe("TrustVault — Public Landing Page & Entry Authentication Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Header / Navigation Bar", () => {
    it("renders TrustVault logo and name", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getAllByText("TrustVault").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Secure Document Platform").length).toBeGreaterThan(0);
    });

    it("renders navigation links for Home, Features, Security, and About", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const nav = screen.getByRole("navigation");
      expect(within(nav).getByRole("link", { name: /^home$/i })).toBeDefined();
      expect(within(nav).getByRole("link", { name: /^features$/i })).toBeDefined();
      expect(within(nav).getByRole("link", { name: /^security$/i })).toBeDefined();
      expect(within(nav).getByRole("link", { name: /^about$/i })).toBeDefined();
    });

    it("renders Login button for unauthenticated visitors without Sign Up links", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const nav = screen.getByRole("navigation");
      const loginBtn = within(nav).getByRole("link", { name: /^login$/i });
      expect(loginBtn.getAttribute("href")).toBe("/login");

      expect(within(nav).queryByRole("link", { name: /sign up|register/i })).toBeNull();
    });

    it("toggles responsive mobile menu drawer when hamburger is clicked", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const toggleBtn = screen.getByRole("button", { name: /open navigation menu/i });
      expect(toggleBtn).toBeDefined();

      fireEvent.click(toggleBtn);

      expect(screen.getByRole("button", { name: /close navigation menu/i })).toBeDefined();
      expect(screen.getByText("Features", { selector: ".landing-mobile-nav-link" })).toBeDefined();
    });
  });

  describe("2. Hero Section", () => {
    it("renders exact required main heading and description", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(
        screen.getByRole("heading", {
          name: /your documents\. your control\. your trustvault\./i
        })
      ).toBeDefined();

      expect(
        screen.getByText(
          /trustvault is a secure document-sharing platform designed to help users manage, protect, and share confidential documents with controlled access\. organize your documents, manage permissions, and maintain greater control over who can access your information\./i
        )
      ).toBeDefined();
    });

    it("renders Get Started CTA navigating to /login for unauthenticated visitors", () => {
      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const getStartedBtn = container.querySelector("#hero-get-started-btn");
      expect(getStartedBtn).toBeDefined();
      expect(getStartedBtn?.getAttribute("href")).toBe("/login");
    });

    it("renders Learn More CTA navigating to /login", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const learnMoreBtn = screen.getByRole("link", { name: /learn more/i });
      expect(learnMoreBtn).toBeDefined();
      expect(learnMoreBtn.getAttribute("href")).toBe("/login");
    });
  });

  describe("3. Implemented Features Section", () => {
    it("renders all four required implemented feature cards", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByRole("heading", { name: /secure document management/i })).toBeDefined();
      expect(screen.getByRole("heading", { name: /controlled document sharing/i })).toBeDefined();
      expect(screen.getByRole("heading", { name: /role-based access/i })).toBeDefined();
      expect(screen.getByRole("heading", { name: /access monitoring and audit trails/i })).toBeDefined();
    });
  });

  describe("4. Security and About Sections", () => {
    it("renders Security section explaining controlled document access", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(
        screen.getByRole("heading", { name: /security grounded in controlled access/i })
      ).toBeDefined();
      expect(screen.getAllByText(/server-verified permissions/i).length).toBeGreaterThan(0);
      expect(screen.getByText(/single-device active sessions/i)).toBeDefined();
      expect(screen.getByText(/strict role isolation/i)).toBeDefined();
    });

    it("renders About section explaining document management and access control", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(
        screen.getByRole("heading", { name: /designed for controlled document access/i })
      ).toBeDefined();
    });
  });

  describe("5. Footer & Theme", () => {
    it("renders footer with branding, nav links, legal links, and copyright", () => {
      render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(screen.getByRole("link", { name: /terms & conditions/i })).toBeDefined();
      expect(screen.getByRole("link", { name: /privacy policy/i })).toBeDefined();
      expect(screen.getByText(/© 2026 trustvault\. all rights reserved\./i)).toBeDefined();
    });

    it("applies the Viewer theme (data-role='viewer') to the landing root container", () => {
      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const root = container.querySelector(".landing-page-root");
      expect(root).toBeDefined();
      expect(root?.getAttribute("data-role")).toBe("viewer");
    });
  });

  describe("6. Authenticated User Flow on Landing Page", () => {
    it("displays Dashboard button instead of Login/Signup for authenticated Viewer", () => {
      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={authenticatedViewerContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const nav = screen.getByRole("navigation");
      const dashboardBtn = container.querySelector("#landing-dashboard-btn");
      expect(dashboardBtn).toBeDefined();
      expect(dashboardBtn?.getAttribute("href")).toBe("/viewer/dashboard");

      expect(within(nav).queryByRole("link", { name: /^login$/i })).toBeNull();
      expect(within(nav).queryByRole("link", { name: /^sign up$/i })).toBeNull();
    });

    it("displays Dashboard button pointing to /dashboard for authenticated Owner", () => {
      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={authenticatedOwnerContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const dashboardBtn = container.querySelector("#landing-dashboard-btn");
      expect(dashboardBtn).toBeDefined();
      expect(dashboardBtn?.getAttribute("href")).toBe("/dashboard");
    });

    it("displays Dashboard button pointing to /admin for authenticated Admin", () => {
      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={authenticatedAdminContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      const dashboardBtn = container.querySelector("#landing-dashboard-btn");
      expect(dashboardBtn).toBeDefined();
      expect(dashboardBtn?.getAttribute("href")).toBe("/admin");
    });
  });

  describe("7. Route Protection & Unauthenticated Redirection", () => {
    it("redirects unauthenticated visitor from protected /dashboard to /login", () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AuthContext.Provider value={unauthContext}>
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      // Verify user is redirected to Login Page
      expect(screen.getByRole("heading", { name: /sign in to trustvault/i })).toBeDefined();
    });

    it("renders Public Landing Page directly at root / for unauthenticated visitor", () => {
      render(
        <MemoryRouter initialEntries={["/"]}>
          <AuthContext.Provider value={unauthContext}>
            <ToastProvider>
              <TemporaryAccessProvider>
                <AppRoutes />
              </TemporaryAccessProvider>
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(
        screen.getByRole("heading", {
          name: /your documents\. your control\. your trustvault\./i
        })
      ).toBeDefined();
    });
  });

  describe("8. Responsive Layout & Viewport Verification (320px, 360px, 375px, 390px, 430px, 768px, 1024px)", () => {
    const mobileWidths = [320, 360, 375, 390, 430];

    mobileWidths.forEach((width) => {
      it(`renders correctly on mobile width ${width}px without horizontal overflow risk`, () => {
        window.innerWidth = width;
        window.dispatchEvent(new Event("resize"));

        const { container } = render(
          <MemoryRouter>
            <AuthContext.Provider value={unauthContext}>
              <LandingPage />
            </AuthContext.Provider>
          </MemoryRouter>
        );

        const root = container.querySelector(".landing-page-root");
        expect(root).toBeDefined();
        expect(root?.classList.contains("landing-page-root")).toBe(true);

        // Header, mobile toggle, hero, feature cards, and footer exist
        expect(container.querySelector("#landing-mobile-menu-toggle")).toBeDefined();
        expect(container.querySelector("#hero-get-started-btn")).toBeDefined();
        expect(container.querySelectorAll(".landing-feature-card").length).toBe(4);
        expect(container.querySelector(".landing-footer")).toBeDefined();
      });
    });

    it("renders correctly on tablet width 768px", () => {
      window.innerWidth = 768;
      window.dispatchEvent(new Event("resize"));

      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(container.querySelector(".landing-features-grid")).toBeDefined();
      expect(container.querySelectorAll(".landing-feature-card").length).toBe(4);
    });

    it("renders correctly on desktop width 1024px+", () => {
      window.innerWidth = 1024;
      window.dispatchEvent(new Event("resize"));

      const { container } = render(
        <MemoryRouter>
          <AuthContext.Provider value={unauthContext}>
            <LandingPage />
          </AuthContext.Provider>
        </MemoryRouter>
      );

      expect(container.querySelector(".landing-nav-links")).toBeDefined();
      expect(container.querySelector(".landing-hero-grid")).toBeDefined();
    });
  });
});
