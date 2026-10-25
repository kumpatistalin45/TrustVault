import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DocumentDetailsPage } from '../pages/DocumentDetailsPage'
import { AuthContext } from '../context/AuthContext'
import { ToastContext } from '../context/ToastContext'
import { TemporaryAccessProvider } from '../context/TemporaryAccessContext'
import * as api from '../services/api'

function renderDetailsPage(authOverrides = {}, docId = '101') {
  const defaultAuth = {
    user: { id: 2, name: 'Jane Doe', email: 'jane.owner@trustvault.internal', role: 'owner' },
    isOwner: true,
    isAdmin: false,
    isViewer: false,
    ...authOverrides
  }

  const defaultToast = {
    showToast: vi.fn(),
    removeToast: vi.fn()
  }

  return {
    ...render(
      <MemoryRouter initialEntries={[`/documents/${docId}`]}>
        <AuthContext.Provider value={defaultAuth}>
          <ToastContext.Provider value={defaultToast}>
            <TemporaryAccessProvider>
              <Routes>
                <Route path="/documents/:id" element={<DocumentDetailsPage />} />
                <Route path="/documents" element={<div>Vault Documents List</div>} />
              </Routes>
            </TemporaryAccessProvider>
          </ToastContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    ),
    toastSpy: defaultToast.showToast
  }
}

describe('TrustVault — Mobile Alignment & Owner Access Timer with Auto-Delete', () => {
  const mockDoc = {
    id: 101,
    name: 'Snovasys_Hiring_Challenge_Specs.pdf',
    owner_id: 2,
    access_level: 'owner',
    category: 'Engineering',
    size_bytes: 2457600,
    timer_enabled: false,
    timer_duration_minutes: 5,
    auto_delete: true,
    created_at: '2026-10-18T14:20:00Z'
  }

  const mockPermissions = [
    {
      id: 501,
      document_id: 101,
      user_id: 3,
      user_name: 'Bob Smith',
      user_email: 'bob.viewer@trustvault.internal',
      unique_id: 'TV-USR-003',
      permission: 'read',
      created_at: '2026-10-18T10:00:00Z'
    }
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'apiGetDocument').mockResolvedValue({ document: { ...mockDoc } })
    vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: mockPermissions })
    vi.spyOn(api, 'apiUpdateDocument').mockResolvedValue({ document: { ...mockDoc } })
    vi.spyOn(api, 'apiDeleteDocument').mockResolvedValue({ message: 'Document deleted successfully' })
    vi.spyOn(api, 'apiUnlockDocument').mockResolvedValue({ success: true, timer_duration_minutes: 5 })
    vi.spyOn(api, 'apiDownloadDocument').mockResolvedValue({ blobUrl: 'blob:mock-url', blob: new Blob(['test']) })
  })

  it('1. Renders DocumentDetailsPage with responsive page card and wrapped metadata', async () => {
    renderDetailsPage()

    await waitFor(() => {
      expect(screen.getByText('Snovasys_Hiring_Challenge_Specs.pdf')).toBeDefined()
      expect(screen.getByText('Document Metadata')).toBeDefined()
      expect(screen.getByText(/AES-256-GCM Envelope Verified/i)).toBeDefined()
      expect(screen.getByText(/Back to My Vault/i)).toBeDefined()
    })
  })

  it('2. Owner sees Access Timer & Auto-Delete Policy card and can configure timer', async () => {
    const updateSpy = vi.spyOn(api, 'apiUpdateDocument').mockResolvedValue({
      document: {
        ...mockDoc,
        timer_enabled: true,
        timer_duration_minutes: 10,
        auto_delete: true
      }
    })

    const { toastSpy } = renderDetailsPage({ isOwner: true, role: 'owner' })

    await waitFor(() => {
      expect(screen.getByText(/Access Timer & Auto-Delete Policy/i)).toBeDefined()
      expect(screen.getByText(/Permanent Access \(No Timer\)/i)).toBeDefined()
    })

    // Click "Configure Timer" button
    const configBtn = screen.getByRole('button', { name: /configure timer/i })
    fireEvent.click(configBtn)

    // Checkbox to enable timer
    const enableCheckbox = screen.getByLabelText(/Enable Time-Limited Access/i)
    fireEvent.click(enableCheckbox)

    // Select 10 Mins preset
    const tenMinBtn = screen.getByRole('button', { name: /^10 Mins$/i })
    fireEvent.click(tenMinBtn)

    // Ensure auto-delete checkbox is checked
    const autoDeleteCheckbox = screen.getByLabelText(/Automatically delete document from vault/i)
    expect(autoDeleteCheckbox.checked).toBe(true)

    // Click "Save Timer Settings"
    const saveBtn = screen.getByRole('button', { name: /save timer settings/i })
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith(101, expect.objectContaining({
        timer_enabled: true,
        timer_duration_minutes: 10,
        auto_delete: true
      }))
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('timer and auto-delete settings saved'),
        'success'
      )
    })
  })

  it('3. Viewer sees Locked Security Gate when document has timer enabled and must enter secret key', async () => {
    vi.spyOn(api, 'apiGetDocument').mockResolvedValue({
      document: {
        ...mockDoc,
        timer_enabled: true,
        timer_duration_minutes: 5,
        auto_delete: true,
        access_level: 'read'
      }
    })

    renderDetailsPage({
      user: { id: 3, name: 'Bob Smith', email: 'bob.viewer@trustvault.internal', role: 'viewer' },
      isOwner: false,
      isAdmin: false,
      isViewer: true
    })

    await waitFor(() => {
      expect(screen.getByText(/Protected by Access Timer \(5 Min Self-Destruct\)/i)).toBeDefined()
      expect(screen.getAllByRole('button', { name: /enter secret key to unlock/i }).length).toBeGreaterThanOrEqual(1)
    })

    // Click "Enter Secret Key to Unlock"
    const unlockBtns = screen.getAllByRole('button', { name: /enter secret key to unlock/i })
    fireEvent.click(unlockBtns[0])

    // Secret Key OTP Modal should open
    await waitFor(() => {
      expect(screen.getByText('Security Verification')).toBeDefined()
      expect(screen.getByText(/Secret Key Verification/i)).toBeDefined()
    })
  })

  it('4. Entering secret key starts access countdown and unlocks document for viewer', async () => {
    vi.spyOn(api, 'apiGetDocument').mockResolvedValue({
      document: {
        ...mockDoc,
        timer_enabled: true,
        timer_duration_minutes: 5,
        auto_delete: true,
        access_level: 'read'
      }
    })

    const unlockSpy = vi.spyOn(api, 'apiUnlockDocument').mockResolvedValue({
      success: true,
      timer_duration_minutes: 5,
      auto_delete: true
    })

    renderDetailsPage({
      user: { id: 3, name: 'Bob Smith', email: 'bob.viewer@trustvault.internal', role: 'viewer' },
      isOwner: false,
      isAdmin: false,
      isViewer: true
    })

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /enter secret key to unlock/i }).length).toBeGreaterThanOrEqual(1)
    })

    // Open modal
    const unlockBtns = screen.getAllByRole('button', { name: /enter secret key to unlock/i })
    fireEvent.click(unlockBtns[0])

    await waitFor(() => {
      expect(screen.getByText('Security Verification')).toBeDefined()
    })

    // Enter 6 digit secret key
    const inputs = screen.getAllByRole('textbox')
    for (let i = 0; i < 6; i++) {
      fireEvent.change(inputs[i], { target: { value: String(i + 1) } })
    }

    // Click Verify Secret Key & Unlock
    const verifyBtn = screen.getByRole('button', { name: /verify secret key & unlock/i })
    fireEvent.click(verifyBtn)

    await waitFor(() => {
      expect(unlockSpy).toHaveBeenCalledWith(101, '123456')
      expect(screen.getByText(/Active Access Countdown:/i)).toBeDefined()
    })
  })

  it('5. Auto-deletes document and redirects when document-auto-deleted event is dispatched', async () => {
    const { toastSpy } = renderDetailsPage({
      user: { id: 3, name: 'Bob Smith', email: 'bob.viewer@trustvault.internal', role: 'viewer' },
      isOwner: false,
      isAdmin: false,
      isViewer: true
    })

    await waitFor(() => {
      expect(screen.getByText('Snovasys_Hiring_Challenge_Specs.pdf')).toBeDefined()
    })

    // Simulate timer expiration triggering document-auto-deleted
    window.dispatchEvent(
      new CustomEvent('document-auto-deleted', {
        detail: { documentId: 101, documentName: 'Snovasys_Hiring_Challenge_Specs.pdf' }
      })
    )

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('was automatically deleted from the vault'),
        'error'
      )
      expect(screen.getByText('Vault Documents List')).toBeDefined()
    })
  })
})
