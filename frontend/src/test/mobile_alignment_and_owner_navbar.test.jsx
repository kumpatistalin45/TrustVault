import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import { ToastProvider } from '../context/ToastContext'
import { TemporaryAccessProvider } from '../context/TemporaryAccessContext'
import { Sidebar } from '../components/layout/Sidebar'
import { Header } from '../components/layout/Header'
import { DashboardPage } from '../pages/DashboardPage'
import { PermissionsPage } from '../pages/PermissionsPage'
import { ShareModal } from '../components/common/ShareModal'
import { Modal } from '../components/common/Modal'
import * as api from '../services/api'

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

describe('TrustVault Mobile Alignment & Owner Navbar Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('1. Owner Sidebar contains Manage Permissions button pointing to /permissions', () => {
    renderWithProviders(<Sidebar isOpen={true} onClose={vi.fn()} />, {
      authValue: { isOwner: true, role: 'owner' }
    })

    const permLink = screen.getByRole('link', { name: /Manage Permissions/i })
    expect(permLink).toBeDefined()
    expect(permLink.getAttribute('href')).toBe('/permissions')
  })

  it('2. Owner Header navbar contains Manage Permissions quick button', () => {
    renderWithProviders(<Header onToggleSidebar={vi.fn()} isSidebarOpen={false} />, {
      authValue: { isOwner: true, role: 'owner' }
    })

    const permHeaderBtn = screen.getByRole('link', { name: /Manage Permissions/i })
    expect(permHeaderBtn).toBeDefined()
    expect(permHeaderBtn.getAttribute('href')).toBe('/permissions')
  })

  it('3. Owner Dashboard Discretionary Permissions card links to /permissions', async () => {
    vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({
      documents: [
        { id: 101, name: 'Owner_Doc.pdf', owner_id: 2, access_level: 'owner', size_bytes: 1024 }
      ]
    })
    vi.spyOn(api, 'apiGetOwnerActivity').mockResolvedValue({ activity: [] })
    vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: [] })

    renderWithProviders(<DashboardPage />, {
      authValue: { user: { id: 2 }, isOwner: true, role: 'owner' }
    })

    await waitFor(() => {
      const manageBtn = screen.getByRole('link', { name: /Manage Discretionary Permissions/i })
      expect(manageBtn).toBeDefined()
      expect(manageBtn.getAttribute('href')).toBe('/permissions')
    })
  })

  it('4. Modal component renders with scrollable overlay to prevent mobile screen lock', () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Mobile Dialog">
        <div>Modal Content</div>
      </Modal>
    )

    const overlay = container.querySelector('.modal-overlay')
    expect(overlay).toBeDefined()
    expect(overlay.style.overflowY).toBe('auto')

    const dialog = container.querySelector('.modal-dialog')
    expect(dialog).toBeDefined()
    expect(dialog.style.display).toBe('flex')
    expect(dialog.style.flexDirection).toBe('column')
  })

  it('5. ShareModal renders without clipping and wraps collaborator cards', async () => {
    vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({
      permissions: [
        { id: 1, user_id: 3, user_name: 'Bob Smith', user_email: 'bob.viewer@trustvault.internal', permission: 'read' }
      ]
    })

    renderWithProviders(
      <ShareModal
        isOpen={true}
        onClose={vi.fn()}
        documentId={101}
        documentName="Security_Architecture_Threat_Matrix.pdf"
      />
    )

    await waitFor(() => {
      expect(screen.getAllByText(/Bob Smith/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/bob\.viewer@trustvault\.internal/i).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Can Read/i).length).toBeGreaterThan(0)
    })
  })
})
