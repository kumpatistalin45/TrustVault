import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PermissionsPage } from '../pages/PermissionsPage'
import { AuthContext } from '../context/AuthContext'
import { ToastContext } from '../context/ToastContext'
import * as api from '../services/api'

function renderPermissionsPage(authOverrides = {}, docId = '101') {
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
      <MemoryRouter initialEntries={[`/documents/${docId}/permissions`]}>
        <AuthContext.Provider value={defaultAuth}>
          <ToastContext.Provider value={defaultToast}>
            <Routes>
              <Route path="/documents/:id/permissions" element={<PermissionsPage />} />
            </Routes>
          </ToastContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    ),
    toastSpy: defaultToast.showToast
  }
}

describe('TrustVault Owner — Multi-User Grant Access & Exact Search/Filter', () => {
  const mockDoc = {
    id: 101,
    name: 'Quarterly_Financial_Report.pdf',
    owner_id: 2,
    access_level: 'owner',
    category: 'Finance',
    size_bytes: 1048576
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
    },
    {
      id: 502,
      document_id: 101,
      user_id: 4,
      user_name: 'Sarah Connor',
      user_email: 'sarah.connor@trustvault.internal',
      unique_id: 'TV-USR-004',
      permission: 'edit',
      created_at: '2026-10-19T14:30:00Z'
    }
  ]

  const mockEligibleUsers = [
    {
      id: 3,
      name: 'Bob Smith',
      email: 'bob.viewer@trustvault.internal',
      role: 'viewer',
      unique_id: 'TV-USR-003'
    },
    {
      id: 4,
      name: 'Sarah Connor',
      email: 'sarah.connor@trustvault.internal',
      role: 'owner',
      unique_id: 'TV-USR-004'
    },
    {
      id: 5,
      name: 'David Kim',
      email: 'david.kim@trustvault.internal',
      role: 'viewer',
      unique_id: 'TV-USR-005'
    },
    {
      id: 6,
      name: 'Elena Rostova',
      email: 'elena.r@trustvault.internal',
      role: 'viewer',
      unique_id: 'TV-USR-006'
    }
  ]

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(api, 'apiGetDocument').mockResolvedValue({ document: mockDoc })
    vi.spyOn(api, 'apiGetPermissions').mockResolvedValue({ permissions: mockPermissions })
    vi.spyOn(api, 'apiGetDocuments').mockResolvedValue({ documents: [mockDoc] })
    vi.spyOn(api, 'apiGetEligibleUsers').mockResolvedValue({ users: mockEligibleUsers })
  })

  it('1. Renders updated Grant Document Access to Eligible Users heading and subtext', async () => {
    renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText('Grant Document Access to Eligible Users')).toBeDefined()
      expect(screen.getByText(/Select multiple users by Email ID or Unique ID/i)).toBeDefined()
    })
  })

  it('2. Allows selecting multiple users by Email ID and Unique ID and displays recipient pills', async () => {
    renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText('Grant Document Access to Eligible Users')).toBeDefined()
    })

    // Click Browse Eligible Users
    const browseBtn = screen.getByRole('button', { name: /browse eligible users/i })
    fireEvent.click(browseBtn)

    await waitFor(() => {
      expect(screen.getByText(/Eligible Users \(\d+ found\)/i)).toBeDefined()
      expect(screen.getByText('david.kim@trustvault.internal')).toBeDefined()
      expect(screen.getByText('elena.r@trustvault.internal')).toBeDefined()
    })

    // Click David Kim's card to select him
    fireEvent.click(screen.getByText('David Kim'))

    // Verify David Kim added to Selected Recipients pill tray
    await waitFor(() => {
      expect(screen.getByText(/Selected Recipients/i)).toBeDefined()
      expect(screen.getAllByText('TV-USR-005').length).toBeGreaterThanOrEqual(1)
    })

    // Add another user via input by Unique ID: TV-USR-006
    const input = screen.getByPlaceholderText(/registered.user@trustvault.internal/i)
    fireEvent.change(input, { target: { value: 'TV-USR-006' } })

    const addBtn = screen.getByRole('button', { name: /^add$/i })
    fireEvent.click(addBtn)

    await waitFor(() => {
      expect(screen.getAllByText(/TV-USR-006/).length).toBeGreaterThanOrEqual(1)
    })
  })

  it('3. Filters eligible users by role and exact search toggle', async () => {
    const eligibleSpy = vi.spyOn(api, 'apiGetEligibleUsers')
    renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText('Grant Document Access to Eligible Users')).toBeDefined()
    })

    // Click "Viewers" role filter button
    const viewersBtn = screen.getByRole('button', { name: /viewers/i })
    fireEvent.click(viewersBtn)

    await waitFor(() => {
      expect(eligibleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'viewer'
        })
      )
    })

    // Click "Exact Search" toggle
    const exactBtn = screen.getByRole('button', { name: /exact search: off/i })
    fireEvent.click(exactBtn)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /exact search: on/i })).toBeDefined()
      expect(eligibleSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          exact: true
        })
      )
    })
  })

  it('4. Executes batch permissions grant for all selected users in Review step', async () => {
    const grantSpy = vi.spyOn(api, 'apiGrantPermission').mockResolvedValue({ success: true })
    const { toastSpy } = renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText('Grant Document Access to Eligible Users')).toBeDefined()
    })

    // Browse eligible users
    fireEvent.click(screen.getByRole('button', { name: /browse eligible users/i }))

    await waitFor(() => {
      expect(screen.getByText('david.kim@trustvault.internal')).toBeDefined()
    })

    // Select David Kim
    fireEvent.click(screen.getByText('David Kim'))

    // Proceed to Review
    const reviewBtn = screen.getByRole('button', { name: /review & confirm/i })
    fireEvent.click(reviewBtn)

    // Review card is visible
    await waitFor(() => {
      expect(screen.getByText('Review Permission Change Before Submitting')).toBeDefined()
      expect(screen.getAllByText(/Recipient/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('david.kim@trustvault.internal')).toBeDefined()
    })

    // Confirm & Grant
    const confirmBtn = screen.getByRole('button', { name: /confirm & grant access/i })
    fireEvent.click(confirmBtn)

    await waitFor(() => {
      expect(grantSpy).toHaveBeenCalledWith('101', expect.objectContaining({
        email: 'david.kim@trustvault.internal',
        permission: 'read'
      }))
      expect(toastSpy).toHaveBeenCalledWith(
        expect.stringContaining('david.kim@trustvault.internal'),
        'success'
      )
    })
  })

  it('5. Filters active collaborators by search query and exact match in Active Collaborators section', async () => {
    renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText(/Active Discretionary Permissions/i)).toBeDefined()
      expect(screen.getByText('bob.viewer@trustvault.internal')).toBeDefined()
      expect(screen.getByText('sarah.connor@trustvault.internal')).toBeDefined()
    })

    // Search for Bob Smith by unique ID TV-USR-003
    const collabSearchInput = screen.getByPlaceholderText(/search by name, email, #id/i)
    fireEvent.change(collabSearchInput, { target: { value: 'TV-USR-003' } })

    // Sarah Connor should be filtered out
    await waitFor(() => {
      expect(screen.getByText('bob.viewer@trustvault.internal')).toBeDefined()
      expect(screen.queryByText('sarah.connor@trustvault.internal')).toBeNull()
    })

    // Toggle Exact match
    const exactBtn = screen.getByRole('button', { name: /^exact$/i })
    fireEvent.click(exactBtn)

    // Clear search
    const resetBtn = screen.getByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)

    await waitFor(() => {
      expect(screen.getByText('bob.viewer@trustvault.internal')).toBeDefined()
      expect(screen.getByText('sarah.connor@trustvault.internal')).toBeDefined()
    })
  })

  it('6. Filters active collaborators by permission level buttons (Read vs Edit)', async () => {
    renderPermissionsPage()

    await waitFor(() => {
      expect(screen.getByText(/Active Discretionary Permissions/i)).toBeDefined()
    })

    // Filter by Read only
    const readBtn = screen.getByRole('button', { name: /^read$/i })
    fireEvent.click(readBtn)

    await waitFor(() => {
      expect(screen.getByText('bob.viewer@trustvault.internal')).toBeDefined()
      expect(screen.queryByText('sarah.connor@trustvault.internal')).toBeNull()
    })

    // Filter by Edit only
    const editBtn = screen.getByRole('button', { name: /^edit$/i })
    fireEvent.click(editBtn)

    await waitFor(() => {
      expect(screen.queryByText('bob.viewer@trustvault.internal')).toBeNull()
      expect(screen.getByText('sarah.connor@trustvault.internal')).toBeDefined()
    })
  })
})
