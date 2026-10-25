import React from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AppShell } from "../components/layout/AppShell";

// Pages
import { LoginPage } from "../pages/LoginPage";
import { AdminOwnersPage } from "../pages/AdminOwnersPage";
import { OwnerViewersPage } from "../pages/OwnerViewersPage";
import { ForgotPasswordPage } from "../pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "../pages/auth/ResetPasswordPage";
import { EmailLinkCallbackPage } from "../pages/auth/EmailLinkCallbackPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ViewerDashboardPage } from "../pages/ViewerDashboardPage";
import { DocumentsPage } from "../pages/DocumentsPage";
import { DownloadHistoryPage } from "../pages/DownloadHistoryPage";
import { UploadPage } from "../pages/UploadPage";
import { DocumentDetailsPage } from "../pages/DocumentDetailsPage";
import { EditDocumentPage } from "../pages/EditDocumentPage";
import { PermissionsPage } from "../pages/PermissionsPage";
import { SharedDocumentsPage } from "../pages/SharedDocumentsPage";
import { SentDocumentsPage } from "../pages/SentDocumentsPage";
import { ActivityPage } from "../pages/ActivityPage";
import { SecurityActivityPage } from "../pages/SecurityActivityPage";
import { AdminAuditPage } from "../pages/AdminAuditPage";
import { AdminDashboardPage } from "../pages/AdminDashboardPage";
import { AdminUsersPage } from "../pages/AdminUsersPage";
import { AdminDocumentsPage } from "../pages/AdminDocumentsPage";
import { AdminPermissionsPage } from "../pages/AdminPermissionsPage";
import { AdminComplaintsPage } from "../pages/AdminComplaintsPage";
import AdminKeysPage from "../pages/AdminKeysPage";
import { ProfilePage } from "../pages/ProfilePage";
import { SettingsPage } from "../pages/SettingsPage";
import { PrivacyPolicyPage } from "../pages/PrivacyPolicyPage";
import { TermsPage } from "../pages/TermsPage";
import { HelpPage } from "../pages/HelpPage";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { LandingPage } from "../pages/LandingPage";

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading, hasAcceptedTerms } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg-primary)",
          color: "var(--text-primary)"
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 600 }}>Initializing TrustVault Session...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Mandatory Terms & Conditions gating after login
  if (
    hasAcceptedTerms === false &&
    location.pathname !== "/terms" &&
    location.pathname !== "/terms-and-conditions"
  ) {
    return <Navigate to="/terms" replace />;
  }

  return children;
}

export function OwnerRoute({ children }) {
  const { isOwner, user, loading } = useAuth();

  if (loading) {
    return null;
  }

  // Pending or rejected Owners must not access the Owner Dashboard
  if (!isOwner || user?.status === "pending" || user?.status === "rejected" || user?.status === "suspended") {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}

export function AdminRoute({ children }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAdmin) {
    return <Navigate to="/access-denied" replace />;
  }

  return children;
}

export function AppRoutes() {
  const { isAuthenticated, isOwner, isAdmin } = useAuth();

  return (
    <Routes>
      {/* Public Authentication Routes */}
      <Route
        path="/login"
        element={
          isAuthenticated ? (
            <Navigate to={isAdmin ? "/admin" : isOwner ? "/dashboard" : "/viewer/dashboard"} replace />
          ) : (
            <LoginPage />
          )
        }
      />
      {/* Firebase Email-Link Callback — must be public, handles sign-in completion */}
      <Route path="/login/callback" element={<EmailLinkCallbackPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Public Landing Page & Root Entry: ALWAYS displays landing page */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/landing" element={<LandingPage />} />

      {/* Mandatory Terms Acceptance Screen (Accessible directly upon login gating) */}
      <Route
        path="/terms"
        element={
          <ProtectedRoute>
            <TermsPage />
          </ProtectedRoute>
        }
      />
      <Route path="/terms-and-conditions" element={<Navigate to="/terms" replace />} />

      {/* Authenticated Protected Shell */}
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route
          path="/dashboard"
          element={
            <OwnerRoute>
              <DashboardPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/viewer/dashboard"
          element={
            <ViewerDashboardPage />
          }
        />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/history" element={<DownloadHistoryPage />} />
        <Route path="/download-history" element={<DownloadHistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/support" element={<Navigate to="/help" replace />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />

        {/* Document Inspection */}
        <Route path="/documents/:id" element={<DocumentDetailsPage />} />

        {/* Owner Operations */}
        <Route
          path="/documents/upload"
          element={
            <OwnerRoute>
              <UploadPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/documents/:id/edit"
          element={
            <OwnerRoute>
              <EditDocumentPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/documents/:id/permissions"
          element={
            <OwnerRoute>
              <PermissionsPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/permissions"
          element={
            <OwnerRoute>
              <PermissionsPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/documents/permissions"
          element={<Navigate to="/permissions" replace />}
        />
        <Route
          path="/activity"
          element={
            <OwnerRoute>
              <ActivityPage />
            </OwnerRoute>
          }
        />
        <Route
          path="/viewers"
          element={
            <OwnerRoute>
              <OwnerViewersPage />
            </OwnerRoute>
          }
        />
        <Route path="/owner/viewers" element={<Navigate to="/viewers" replace />} />

        {/* Admin Dashboard & Management Routes */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboardPage />
            </AdminRoute>
          }
        />
        <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />
        <Route
          path="/admin/users"
          element={
            <AdminRoute>
              <AdminUsersPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/owners"
          element={
            <AdminRoute>
              <AdminOwnersPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/documents"
          element={
            <AdminRoute>
              <AdminDocumentsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/permissions"
          element={
            <AdminRoute>
              <AdminPermissionsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <AdminRoute>
              <AdminAuditPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/complaints"
          element={
            <AdminRoute>
              <AdminComplaintsPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/keys"
          element={
            <AdminRoute>
              <AdminKeysPage />
            </AdminRoute>
          }
        />

        {/* Secondary Views & Redirects */}
        <Route path="/shared" element={<Navigate to="/documents" replace />} />
        <Route path="/sent" element={<Navigate to="/documents" replace />} />
        <Route path="/security" element={<Navigate to="/activity" replace />} />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
      </Route>

      {/* 404 Catch-All */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default AppRoutes;
