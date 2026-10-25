import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import { TemporaryAccessProvider } from '../context/TemporaryAccessContext'
import { OwnerRoute } from '../routes/AppRoutes'
import { DashboardPage } from '../pages/DashboardPage'
import { DocumentsPage } from '../pages/DocumentsPage'
import { UploadPage } from '../pages/UploadPage'
import { PermissionsPage } from '../pages/PermissionsPage'
import { ActivityPage } from '../pages/ActivityPage'
import { Sidebar } from '../components/layout/Sidebar'
import * as api from '../services/api'

// Helper mock wrapper
function renderWithProviders(ui, { authValue = {}, route = '/' } = {}) {
  const defaultAuth = {
    user: { id: 2, name: 'Jane Doe', email: 'jane.owner@trustvault.internal', role: 'owner' },
    isAuthenticated: true,
    loading: false,
    role: 'owner',
    isAdmin: false,
    isOwner: true,
    isViewer: false,
    hasAcceptedTerms: true,
    logout: vi.fn(),
    ...authValue
  }

  return render(
    <AuthContext.Provider value={defaultAuth}>
      <ToastProvider>
        <TemporaryAccessProvider>
          <MemoryRouter initialEntries={[route]}>
            {ui}
          </MemoryRouter>
        </TemporaryAccessProvider>
      </ToastProvider>
    </AuthContext.Provider>
  )
}

describe('TrustVault Phase 3 — Document Owner Features & Security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('1. Owner Route Guards & Navigation', () => {
    it('allows Document Owner through OwnerRoute', () => {
      renderWithProviders(
        <Routes>
          <Route
            path="/documents/upload"
            element={
              <OwnerRoute>
                <div>Owner Protected Upload Form</div>
              </OwnerRoute>
            }
          />
        </Routes>,
        {
          authValue: { isOwner: true, isAdmin: false, isViewer: false },
          route: '/documents/upload'
        }
      )

      expect(screen.getByText('Owner Protected Upload Form')).toBeDefined()
    })

    it('blocks Viewer role from OwnerRoute and redirects to /access-denied', () => {
      renderWithProviders(
        <Routes>
          <Route path="/access-denied" element={<div>Access Denied Screen</div>} />
          <Route
            path="/documents/upload"
            element={
              <OwnerRoute>
                <div>Owner Protected Upload Form</div>
              </OwnerRoute>
            }
          />
        </Routes>,
        {
          authValue: { isOwner: false, isAdmin: false, isViewer: true, role: 'viewer' },
          route: '/documents/upload'
        }
      )

      expect(screen.getByText('Access Denied Screen')).toBeDefined()
      expect(screen.queryByText('Owner Protected Upload Form')).toBeNull()
    })

    it('renders Owner navigation items in Sidebar (Dashboard, My Documents, Upload, Activity)', () => {
      renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />, {
        authValue: { isOwner: true, role: 'owner' }
      })

      expect(screen.getByText('Dashboard')).toBeDefined()
      expect(screen.getByText('My Documents')).toBeDefined()
      expect(screen.getByText('Upload Document')).toBeDefined()
      expect(screen.getByText('Document Activity')).toBeDefined()
      expect(screen.getByText('Document Owner')).toBeDefined()
      expect(screen.getByText('Owner Vault')).toBeDefined()
    })

    it('renders Viewer navigation items in Sidebar for viewer role', () => {
      renderWithProviders(<Sidebar isOpen={false} onClose={vi.fn()} />, {
        authValue: { isOwner: false, isViewer: true, role: 'viewer' }
      })

      expect(screen.getByText('My Documents')).toBeDefined()
      expect(screen.getByText('Download History')).toBeDefined()
      expect(screen.queryByText('Upload Document')).toBeNull()
      expect(screen.getByText('Viewer')).toBeDefined()
    })
  })

  describe('2. Owner Dashboard (Metrics, Recent Uploads, Real Activity)', () => {
    it('renders Owner dashboard metrics and recently uploaded documents', async () => {
      const mockDocs = [
        {
          id: 101,
          name: 'Quarterly_Vault_Report.pdf',
          category: 'Finance',
          mime_type: 'application/pdf',
          size_bytes: 2048576,
          owner_id: 2,
          owner_name: 'Jane Doe',
          access_level: 'owner',
          created_at: new Date().toISOString()
        }
      ]

      vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({ documents: mockDocs })
      vi.spyOn(api, 'apiGetOwnerActivity').mockResolvedValue({ activity: [] })

      renderWithProviders(<DashboardPage />, {
        authValue: { user: { id: 2, name: 'Jane Doe' }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText(/Quarterly_Vault_Report.pdf/i)).toBeDefined()
      })

      expect(screen.getByText('Document Owner Portal')).toBeDefined()
      expect(screen.getByText('Recently Uploaded Documents')).toBeDefined()
      expect(screen.getByText('Discretionary Permissions')).toBeDefined()
    })

    it('renders empty state when Owner has no documents', async () => {
      vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({ documents: [] })
      vi.spyOn(api, 'apiGetOwnerActivity').mockResolvedValue({ activity: [] })

      renderWithProviders(<DashboardPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText('No Documents Uploaded Yet')).toBeDefined()
      })
      expect(screen.getByText('Upload Your First Document')).toBeDefined()
    })

    it('displays error and retry banner on API failure', async () => {
      vi.spyOn(api, 'apiGetDocuments').mockRejectedValue(new Error('PostgreSQL connection timeout'))

      renderWithProviders(<DashboardPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText(/PostgreSQL connection timeout/i)).toBeDefined()
      })
      expect(screen.getByText('Retry Connection')).toBeDefined()
    })
  })

  describe('3. Upload Document Validation & Confirmation', () => {
    it('renders upload form with drag & drop, title, category, and description inputs', () => {
      renderWithProviders(<UploadPage />, {
        authValue: { isOwner: true, isViewer: false }
      })

      expect(screen.getByText('Upload & Encrypt Document')).toBeDefined()
      expect(screen.getByLabelText(/Document Title/i)).toBeDefined()
      expect(screen.getByLabelText(/Document Category/i)).toBeDefined()
      expect(screen.getByLabelText(/Optional Description/i)).toBeDefined()
      expect(screen.getByText(/Drag and drop your document here/i)).toBeDefined()
    })

    it('rejects oversized files exceeding 10MB limit with clear feedback', () => {
      renderWithProviders(<UploadPage />, {
        authValue: { isOwner: true, isViewer: false }
      })

      const fileInput = document.querySelector('input[type="file"]')
      // 12 MB file
      const bigFile = new File(['a'.repeat(1024)], 'Huge_Archive.pdf', {
        type: 'application/pdf'
      })
      Object.defineProperty(bigFile, 'size', { value: 12 * 1024 * 1024 })

      fireEvent.change(fileInput, { target: { files: [bigFile] } })

      expect(screen.getByText(/File exceeds the 10 MB limit/i)).toBeDefined()
    })

    it('rejects unsupported file extensions (e.g. .exe)', () => {
      renderWithProviders(<UploadPage />, {
        authValue: { isOwner: true, isViewer: false }
      })

      const fileInput = document.querySelector('input[type="file"]')
      const invalidFile = new File(['binary'], 'virus.exe', { type: 'application/x-msdownload' })

      fireEvent.change(fileInput, { target: { files: [invalidFile] } })

      expect(screen.getByText(/Unsupported file format/i)).toBeDefined()
    })

    it('displays confirmed upload card only after backend confirms', async () => {
      const mockNewDoc = {
        id: 777,
        name: 'Confirmed_Spec.pdf',
        category: 'Engineering',
        size_bytes: 102400,
        mime_type: 'application/pdf',
        created_at: new Date().toISOString()
      }

      vi.spyOn(api, 'apiUploadDocument').mockResolvedValue({ document: mockNewDoc })

      renderWithProviders(<UploadPage />, {
        authValue: { isOwner: true, isViewer: false }
      })

      const fileInput = document.querySelector('input[type="file"]')
      const validFile = new File(['dummy content'], 'Confirmed_Spec.pdf', { type: 'application/pdf' })
      Object.defineProperty(validFile, 'size', { value: 102400 })

      fireEvent.change(fileInput, { target: { files: [validFile] } })

      const submitBtn = screen.getByRole('button', { name: /Upload & Seal Document/i })
      fireEvent.click(submitBtn)

      await waitFor(() => {
        expect(screen.getByText('Document Successfully Encrypted & Vaulted')).toBeDefined()
      })

      expect(screen.getByText('#777')).toBeDefined()
      expect(screen.getByText('AES-256-GCM (TVE1)')).toBeDefined()
      expect(screen.getByText('Manage Permissions')).toBeDefined()
    })
  })

  describe('4. Permissions Management & Review Flow', () => {
    it('restricts permission levels to read and edit only (no admin/owner choices)', async () => {
      const mockDoc = {
        id: 101,
        name: 'Snovasys_Hiring_Challenge_Specs.pdf',
        owner_id: 2,
        access_level: 'owner'
      }

      vi.spyOn(api, 'apiGetDocument').mockResolvedValue({ document: mockDoc })
      vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: [] })

      renderWithProviders(<PermissionsPage />, {
        authValue: { user: { id: 2, email: 'owner@trustvault.internal' }, isOwner: true },
        route: '/documents/101/permissions'
      })

      await waitFor(() => {
        expect(screen.getByText(/Manage Permissions:/i)).toBeDefined()
      })

      const select = screen.getByRole('combobox')
      const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)

      expect(options).toEqual(['read', 'edit'])
      expect(options).not.toContain('admin')
      expect(options).not.toContain('owner')
    })

    it('requires a review step before submitting permission grant', async () => {
      const mockDoc = {
        id: 101,
        name: 'Snovasys_Hiring_Challenge_Specs.pdf',
        owner_id: 2,
        access_level: 'owner'
      }

      vi.spyOn(api, 'apiGetDocument').mockResolvedValue({ document: mockDoc })
      vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: [] })
      const grantSpy = vi.spyOn(api, 'apiGrantPermission').mockResolvedValue({ success: true })

      renderWithProviders(<PermissionsPage />, {
        authValue: { user: { id: 2, email: 'owner@trustvault.internal' }, isOwner: true },
        route: '/documents/101/permissions'
      })

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/registered.user@trustvault.internal/i)).toBeDefined()
      })

      const emailInput = screen.getByPlaceholderText(/registered.user@trustvault.internal/i)
      fireEvent.change(emailInput, { target: { value: 'collaborator@trustvault.internal' } })

      // Click Review & Confirm
      const reviewBtn = screen.getByRole('button', { name: /Review & Confirm/i })
      fireEvent.click(reviewBtn)

      // Review card must appear before server is called
      expect(screen.getByText('Review Permission Change Before Submitting')).toBeDefined()
      expect(grantSpy).not.toHaveBeenCalled()

      // Confirm grant
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Grant Access/i })
      fireEvent.click(confirmBtn)

      await waitFor(() => {
        expect(grantSpy).toHaveBeenCalledWith(undefined, {
          email: 'collaborator@trustvault.internal',
          permission: 'read'
        })
      })
    })

    it('shows confirmation modal before revoking permission', async () => {
      const mockDoc = { id: 101, name: 'Audit.pdf', owner_id: 2, access_level: 'owner' }
      const mockPerms = [
        { id: 1, user_id: 5, user_name: 'Alice', user_email: 'alice@trustvault.internal', permission: 'read' }
      ]

      vi.spyOn(api, 'apiGetDocument').mockResolvedValue({ document: mockDoc })
      vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: mockPerms })
      const revokeSpy = vi.spyOn(api, 'apiRevokePermission').mockResolvedValue({ success: true })

      renderWithProviders(<PermissionsPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText('alice@trustvault.internal')).toBeDefined()
      })

      const revokeBtn = screen.getByRole('button', { name: /revoke/i })
      fireEvent.click(revokeBtn)

      // Confirm dialog must be visible
      expect(screen.getByText('Revoke Document Permission')).toBeDefined()

      const confirmRevokeBtn = screen.getByRole('button', { name: /revoke access/i })
      fireEvent.click(confirmRevokeBtn)

      await waitFor(() => {
        expect(revokeSpy).toHaveBeenCalled()
      })
    })
  })

  describe('5. My Documents Library (Search, Ownership Filter & Delete Confirmation)', () => {
    it('supports searching by document name and filtering by ownership', async () => {
      const mockDocs = [
        { id: 101, name: 'Alpha_Design.pdf', category: 'Engineering', owner_id: 2, access_level: 'owner', size_bytes: 1000 },
        { id: 102, name: 'Beta_Financials.xlsx', category: 'Finance', owner_id: 1, access_level: 'read', size_bytes: 2000 }
      ]

      vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({ documents: mockDocs })

      renderWithProviders(<DocumentsPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText('Alpha_Design.pdf')).toBeDefined()
        expect(screen.getByText('Beta_Financials.xlsx')).toBeDefined()
      })

      // Search
      const searchInput = screen.getByPlaceholderText(/Search by document name/i)
      fireEvent.change(searchInput, { target: { value: 'Alpha' } })

      expect(screen.getByText('Alpha_Design.pdf')).toBeDefined()
      expect(screen.queryByText('Beta_Financials.xlsx')).toBeNull()

      // Reset search and test ownership filter
      fireEvent.change(searchInput, { target: { value: '' } })
      const ownedTab = screen.getByRole('button', { name: /Owned by Me/i })
      fireEvent.click(ownedTab)

      expect(screen.getByText('Alpha_Design.pdf')).toBeDefined()
      expect(screen.queryByText('Beta_Financials.xlsx')).toBeNull()
    })

    it('requires confirmation before deleting document', async () => {
      const mockDocs = [
        { id: 101, name: 'Doc_To_Delete.pdf', category: 'Engineering', owner_id: 2, access_level: 'owner', size_bytes: 1000 }
      ]

      vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({ documents: mockDocs })
      const deleteSpy = vi.spyOn(api, 'apiDeleteDocument').mockResolvedValue({ message: 'Deleted' })

      renderWithProviders(<DocumentsPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText('Doc_To_Delete.pdf')).toBeDefined()
      })

      const deleteBtn = screen.getByTitle('Delete Document')
      fireEvent.click(deleteBtn)

      // Confirm dialog must appear
      expect(screen.getByText('Delete Vault Document')).toBeDefined()
      expect(deleteSpy).not.toHaveBeenCalled()

      // Confirm deletion
      const confirmDeleteBtn = screen.getByRole('button', { name: /^Delete Document$/i })
      fireEvent.click(confirmDeleteBtn)

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith(101)
      })
    })
  })

  describe('6. Document Activity (Read-Only & Visibility Scope)', () => {
    it('renders read-only activity table with event types and outcomes', async () => {
      const mockActivities = [
        {
          id: 901,
          action: 'document_upload',
          outcome: 'success',
          actor_name: 'Jane Doe',
          document_id: 101,
          details: { filename: 'Security_Threat_Model.pdf' },
          created_at: new Date().toISOString()
        },
        {
          id: 902,
          action: 'permission_grant',
          outcome: 'denied',
          actor_name: 'Bob Smith',
          document_id: 101,
          details: { reason: 'Unauthorized access' },
          created_at: new Date().toISOString()
        }
      ]

      vi.spyOn(api, 'apiGetOwnerActivity').mockResolvedValue({ activity: mockActivities })

      renderWithProviders(<ActivityPage />, {
        authValue: { user: { id: 2 }, isOwner: true }
      })

      await waitFor(() => {
        expect(screen.getByText(/Security_Threat_Model.pdf/i)).toBeDefined()
      })

      expect(screen.getByText('Document Activity')).toBeDefined()
      expect(screen.getByText('UPLOAD')).toBeDefined()
      expect(screen.getByText('GRANT')).toBeDefined()
      expect(screen.getByText('success')).toBeDefined()
      expect(screen.getByText('denied')).toBeDefined()

      // Ensure strictly read-only: no delete/mutation buttons for audit entries
      expect(screen.queryByRole('button', { name: /delete audit/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /clear history/i })).toBeNull()
    })
  })
})
