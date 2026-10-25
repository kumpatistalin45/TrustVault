import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./LandingPage.css";
import {
  Shield,
  FileText,
  Share2,
  Users,
  Activity,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  KeyRound,
  ShieldCheck,
  Menu,
  X,
  FileCheck,
  ChevronRight
} from "lucide-react";

export function LandingPage() {
  const { isAuthenticated, isOwner, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Compute dashboard link based on server-verified user role
  const dashboardPath = isAdmin ? "/admin" : isOwner ? "/dashboard" : "/viewer/dashboard";

  const scrollToSection = (e, sectionId) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToTop = (e) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="landing-page-root" data-role="viewer">
      {/* Header / Navigation */}
      <header className="landing-header">
        <div className="landing-container">
          <nav className="landing-nav" aria-label="Main Navigation">
            {/* Logo and Name */}
            <a href="#top" onClick={scrollToTop} className="landing-brand" aria-label="TrustVault Home">
              <div className="landing-brand-icon">
                <Shield size={20} />
              </div>
              <div>
                <span className="landing-brand-text">TrustVault</span>
                <span className="landing-brand-subtitle">Secure Document Platform</span>
              </div>
            </a>

            {/* Desktop Navigation Links */}
            <ul className="landing-nav-links">
              <li>
                <a href="#top" onClick={scrollToTop} className="landing-nav-link" id="nav-link-home">
                  Home
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  onClick={(e) => scrollToSection(e, "features")}
                  className="landing-nav-link"
                  id="nav-link-features"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href="#security"
                  onClick={(e) => scrollToSection(e, "security")}
                  className="landing-nav-link"
                  id="nav-link-security"
                >
                  Security
                </a>
              </li>
              <li>
                <a
                  href="#about"
                  onClick={(e) => scrollToSection(e, "about")}
                  className="landing-nav-link"
                  id="nav-link-about"
                >
                  About
                </a>
              </li>
            </ul>

            {/* Desktop Action Buttons */}
            <div className="landing-nav-actions">
              {isAuthenticated ? (
                <Link
                  to={dashboardPath}
                  className="landing-btn landing-btn-primary"
                  id="landing-dashboard-btn"
                >
                  Dashboard
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="landing-btn landing-btn-primary"
                  id="landing-login-btn"
                >
                  Login
                </Link>
              )}

              {/* Mobile Menu Toggle Button */}
              <button
                type="button"
                className="landing-menu-toggle"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                id="landing-mobile-menu-toggle"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </nav>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="landing-mobile-menu" id="landing-mobile-menu">
            <button
              type="button"
              onClick={scrollToTop}
              className="landing-mobile-nav-link"
              id="mobile-nav-link-home"
            >
              Home
            </button>
            <button
              type="button"
              onClick={(e) => scrollToSection(e, "features")}
              className="landing-mobile-nav-link"
              id="mobile-nav-link-features"
            >
              Features
            </button>
            <button
              type="button"
              onClick={(e) => scrollToSection(e, "security")}
              className="landing-mobile-nav-link"
              id="mobile-nav-link-security"
            >
              Security
            </button>
            <button
              type="button"
              onClick={(e) => scrollToSection(e, "about")}
              className="landing-mobile-nav-link"
              id="mobile-nav-link-about"
            >
              About
            </button>

            <div className="landing-mobile-nav-actions">
              {isAuthenticated ? (
                <Link
                  to={dashboardPath}
                  onClick={() => setMobileMenuOpen(false)}
                  className="landing-btn landing-btn-primary"
                  id="mobile-landing-dashboard-btn"
                >
                  Dashboard
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="landing-btn landing-btn-primary"
                  id="mobile-landing-login-btn"
                >
                  Login
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Main Page Body */}
      <main id="top">
        {/* Hero Section */}
        <section className="landing-hero" id="hero">
          <div className="landing-container">
            <div className="landing-hero-grid">
              {/* Left Column: Heading, Description & CTAs */}
              <div className="landing-hero-content">
                <div className="landing-badge-pill">
                  <ShieldCheck size={14} />
                  <span>Controlled Document Sharing Platform</span>
                </div>

                <h1 className="landing-hero-title">
                  Your Documents. Your Control. Your TrustVault.
                </h1>

                <p className="landing-hero-desc">
                  TrustVault is a secure document-sharing platform designed to help users manage, protect, and share confidential documents with controlled access. Organize your documents, manage permissions, and maintain greater control over who can access your information.
                </p>

                <div className="landing-hero-cta-group">
                  <Link
                    to="/login"
                    className="landing-btn landing-btn-primary landing-hero-btn-primary"
                    id="hero-get-started-btn"
                  >
                    <span>Get Started</span>
                    <ArrowRight size={16} />
                  </Link>

                  <Link
                    to="/login"
                    className="landing-btn landing-btn-secondary landing-hero-btn-secondary"
                    id="hero-learn-more-btn"
                  >
                    Learn More
                  </Link>
                </div>

                <div className="landing-hero-trust-row">
                  <div className="landing-trust-item">
                    <CheckCircle2 size={15} color="#2563eb" />
                    <span>Role-Based Access</span>
                  </div>
                  <div className="landing-trust-item">
                    <CheckCircle2 size={15} color="#2563eb" />
                    <span>Per-Document Permissions</span>
                  </div>
                  <div className="landing-trust-item">
                    <CheckCircle2 size={15} color="#2563eb" />
                    <span>Full Audit Trails</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Viewer Interface Mockup */}
              <div className="landing-hero-visual" aria-hidden="true">
                <div className="landing-preview-window">
                  <div className="landing-preview-topbar">
                    <div className="landing-preview-dots">
                      <span className="landing-preview-dot" style={{ background: "#ef4444" }} />
                      <span className="landing-preview-dot" style={{ background: "#f59e0b" }} />
                      <span className="landing-preview-dot" style={{ background: "#10b981" }} />
                    </div>
                    <div className="landing-preview-address">
                      <Lock size={11} color="#2563eb" />
                      <span>trustvault.internal/portal</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 500 }}>
                      Viewer Theme
                    </span>
                  </div>

                  <div className="landing-preview-body">
                    <div className="landing-preview-status-pill">
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            width: "8px",
                            height: "8px",
                            borderRadius: "50%",
                            background: "#2563eb",
                            display: "inline-block"
                          }}
                        />
                        <strong style={{ color: "#0f172a" }}>Verified Session:</strong>
                        <span style={{ color: "#475569" }}>Viewer Role Active</span>
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          color: "#1d4ed8",
                          background: "rgba(37, 99, 235, 0.12)",
                          padding: "2px 8px",
                          borderRadius: "9999px"
                        }}
                      >
                        Single-Device Gated
                      </span>
                    </div>

                    <div className="landing-preview-doc-row">
                      <div className="landing-preview-doc-info">
                        <FileCheck size={18} color="#2563eb" />
                        <div>
                          <div className="landing-preview-doc-name">Security_Architecture_v2.pdf</div>
                          <div className="landing-preview-doc-meta">Security • 1.9 MB • Assigned Access</div>
                        </div>
                      </div>
                      <span
                        className="landing-preview-badge"
                        style={{ background: "rgba(37, 99, 235, 0.1)", color: "#1d4ed8" }}
                      >
                        View & Download
                      </span>
                    </div>

                    <div className="landing-preview-doc-row">
                      <div className="landing-preview-doc-info">
                        <FileText size={18} color="#0284c7" />
                        <div>
                          <div className="landing-preview-doc-name">Snovasys_Hiring_Specs.pdf</div>
                          <div className="landing-preview-doc-meta">Engineering • 2.4 MB • Read-Only</div>
                        </div>
                      </div>
                      <span
                        className="landing-preview-badge"
                        style={{ background: "rgba(14, 165, 233, 0.1)", color: "#0284c7" }}
                      >
                        Controlled View
                      </span>
                    </div>

                    <div className="landing-preview-doc-row">
                      <div className="landing-preview-doc-info">
                        <FileText size={18} color="#475569" />
                        <div>
                          <div className="landing-preview-doc-name">Executive_Board_Briefing.pdf</div>
                          <div className="landing-preview-doc-meta">Management • 1.2 MB • Owner-Protected</div>
                        </div>
                      </div>
                      <span
                        className="landing-preview-badge"
                        style={{ background: "rgba(15, 23, 42, 0.06)", color: "#475569" }}
                      >
                        Permission-Gated
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="landing-features-section" id="features">
          <div className="landing-container">
            <div className="landing-section-header">
              <span className="landing-section-tag">Core Capabilities</span>
              <h2 className="landing-section-title">
                Platform Features for Document Control
              </h2>
              <p className="landing-section-desc">
                TrustVault provides practical, implemented tools for organizing confidential files, managing distribution, and maintaining oversight across user roles.
              </p>
            </div>

            <div className="landing-features-grid">
              {/* Feature 1 */}
              <div className="landing-feature-card">
                <div className="landing-feature-icon">
                  <FileText size={22} />
                </div>
                <h3 className="landing-feature-title">Secure Document Management</h3>
                <p className="landing-feature-desc">
                  Store, categorize, and organize sensitive corporate files with validated upload boundaries, structured categories, and centralized metadata editing.
                </p>
                <ul className="landing-feature-points">
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Category & name organization</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Upload size bounds verification</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Metadata updates by document owners</span>
                  </li>
                </ul>
              </div>

              {/* Feature 2 */}
              <div className="landing-feature-card">
                <div className="landing-feature-icon">
                  <Share2 size={22} />
                </div>
                <h3 className="landing-feature-title">Controlled Document Sharing</h3>
                <p className="landing-feature-desc">
                  Share files with designated users by exact corporate email address, defining specific access levels and revoking permissions whenever required.
                </p>
                <ul className="landing-feature-points">
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Targeted recipient permission grants</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>View and edit permission controls</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Immediate owner-level revocation</span>
                  </li>
                </ul>
              </div>

              {/* Feature 3 */}
              <div className="landing-feature-card">
                <div className="landing-feature-icon">
                  <Users size={22} />
                </div>
                <h3 className="landing-feature-title">Role-Based Access</h3>
                <p className="landing-feature-desc">
                  Enforce separation of responsibilities across Viewers, Document Owners, and System Administrators, ensuring each role operates within approved functional boundaries.
                </p>
                <ul className="landing-feature-points">
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Viewer download & viewing workspace</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Owner document & permission console</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Admin oversight and user management</span>
                  </li>
                </ul>
              </div>

              {/* Feature 4 */}
              <div className="landing-feature-card">
                <div className="landing-feature-icon">
                  <Activity size={22} />
                </div>
                <h3 className="landing-feature-title">Access Monitoring and Audit Trails</h3>
                <p className="landing-feature-desc">
                  Maintain operational transparency through systematic audit logging covering document access, downloads, permission adjustments, and authentication events.
                </p>
                <ul className="landing-feature-points">
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Chronological activity timelines</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Searchable administrator audit logs</span>
                  </li>
                  <li className="landing-feature-point">
                    <CheckCircle2 size={14} color="#2563eb" />
                    <span>Timestamp and actor identity tracking</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="landing-security-section" id="security">
          <div className="landing-container">
            <div className="landing-section-header">
              <span className="landing-section-tag">Security Architecture</span>
              <h2 className="landing-section-title">
                Security Grounded in Controlled Access
              </h2>
              <p className="landing-section-desc">
                TrustVault focuses on dependable security mechanisms: verified authentication, explicit per-document permissions, and traceable session handling.
              </p>
            </div>

            <div className="landing-security-grid">
              <div className="landing-security-card">
                <div className="landing-security-icon">
                  <Lock size={20} />
                </div>
                <div>
                  <h3 className="landing-security-card-title">Server-Verified Permissions</h3>
                  <p className="landing-security-card-desc">
                    Every file view, download, edit, and permission change is verified against backend authorization rules before fulfillment. Client-side state cannot grant document access.
                  </p>
                </div>
              </div>

              <div className="landing-security-card">
                <div className="landing-security-icon">
                  <KeyRound size={20} />
                </div>
                <div>
                  <h3 className="landing-security-card-title">Single-Device Active Sessions</h3>
                  <p className="landing-security-card-desc">
                    Active sessions are continuously monitored to prevent concurrent usage across multiple devices, protecting corporate credentials from concurrent abuse.
                  </p>
                </div>
              </div>

              <div className="landing-security-card">
                <div className="landing-security-icon">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="landing-security-card-title">Strict Role Isolation</h3>
                  <p className="landing-security-card-desc">
                    Viewers, Document Owners, and Administrators operate in dedicated workspaces. Administrative functions do not bypass audit logging or document ownership policies.
                  </p>
                </div>
              </div>

              <div className="landing-security-card">
                <div className="landing-security-icon">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="landing-security-card-title">Accountability & Operational Logging</h3>
                  <p className="landing-security-card-desc">
                    All document operations and permission grants are recorded with timestamps, actor attribution, and outcome statuses, providing clear visibility over document history.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="landing-about-section" id="about">
          <div className="landing-container">
            <div className="landing-about-card">
              <div className="landing-about-content">
                <span className="landing-section-tag" style={{ marginBottom: "16px" }}>
                  About TrustVault
                </span>
                <h3>Designed for Controlled Document Access</h3>
                <p>
                  TrustVault is designed to help users manage, protect, and share confidential documents with controlled access. In everyday workflows, sharing sensitive files often leads to lost visibility over who has access and when documents are downloaded.
                </p>
                <p>
                  TrustVault addresses this by combining structured document organization with explicit permission controls and continuous access tracking. Users can securely upload, organize, and grant granular permissions, ensuring information is accessible only to intended recipients.
                </p>
              </div>

              <div className="landing-about-stats">
                <div className="landing-stat-box">
                  <div className="landing-stat-number">3</div>
                  <div className="landing-stat-label">
                    Tailored User Roles
                    <span style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                      Viewer, Document Owner & System Administrator
                    </span>
                  </div>
                </div>

                <div className="landing-stat-box">
                  <div className="landing-stat-number">100%</div>
                  <div className="landing-stat-label">
                    Server-Verified Permissions
                    <span style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                      Every document operation authenticated
                    </span>
                  </div>
                </div>

                <div className="landing-stat-box">
                  <div className="landing-stat-number">0</div>
                  <div className="landing-stat-label">
                    Unmonitored File Access
                    <span style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 400 }}>
                      All actions recorded in operational audit logs
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pre-Footer Call to Action Banner */}
        <section className="landing-cta-banner">
          <div className="landing-container">
            <div className="landing-cta-card">
              <div className="landing-cta-info">
                <h3>Take Control of Your Confidential Documents</h3>
                <p>
                  Access your organization workspace to manage permissions, share documents securely, and monitor activity.
                </p>
              </div>

              <div className="landing-cta-buttons">
                {isAuthenticated ? (
                  <Link
                    to={dashboardPath}
                    className="landing-btn landing-cta-btn-white"
                    id="cta-dashboard-btn"
                  >
                    Go to Dashboard
                  </Link>
                ) : (
                  <Link
                    to="/login"
                    className="landing-btn landing-cta-btn-white"
                    id="cta-login-btn"
                  >
                    Access TrustVault Portal
                    <ArrowRight size={15} style={{ marginLeft: "8px" }} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-container">
          <div className="landing-footer-grid">
            {/* Branding Column */}
            <div className="landing-footer-brand">
              <a href="#top" onClick={scrollToTop} className="landing-brand" style={{ display: "inline-flex" }}>
                <div className="landing-brand-icon">
                  <Shield size={20} />
                </div>
                <div>
                  <span className="landing-brand-text">TrustVault</span>
                  <span className="landing-brand-subtitle">Secure Document Platform</span>
                </div>
              </a>
              <p>
                A secure document-sharing platform designed to help users manage, protect, and share confidential documents with controlled access.
              </p>
            </div>

            {/* Navigation Column */}
            <div className="landing-footer-col">
              <h4>Navigation</h4>
              <ul className="landing-footer-links">
                <li>
                  <a href="#top" onClick={scrollToTop} className="landing-footer-link">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#features" onClick={(e) => scrollToSection(e, "features")} className="landing-footer-link">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#security" onClick={(e) => scrollToSection(e, "security")} className="landing-footer-link">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#about" onClick={(e) => scrollToSection(e, "about")} className="landing-footer-link">
                    About
                  </a>
                </li>
              </ul>
            </div>

            {/* Authentication Column */}
            <div className="landing-footer-col">
              <h4>Account</h4>
              <ul className="landing-footer-links">
                {isAuthenticated ? (
                  <li>
                    <Link to={dashboardPath} className="landing-footer-link">
                      Go to Dashboard
                    </Link>
                  </li>
                ) : (
                  <>
                    <li>
                      <Link to="/login" className="landing-footer-link">
                        Login
                      </Link>
                    </li>
                    <li>
                      <Link to="/forgot-password" className="landing-footer-link">
                        Reset Password
                      </Link>
                    </li>
                  </>
                )}
              </ul>
            </div>

            {/* Legal & Support Column */}
            <div className="landing-footer-col">
              <h4>Legal & Support</h4>
              <ul className="landing-footer-links">
                <li>
                  <Link to="/terms" className="landing-footer-link">
                    Terms & Conditions
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="landing-footer-link">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/help" className="landing-footer-link">
                    Help & Support
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          {/* Footer Copyright Row */}
          <div className="landing-footer-bottom">
            <span>© 2026 TrustVault. All rights reserved.</span>
            <span>Srividya Poondla</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
