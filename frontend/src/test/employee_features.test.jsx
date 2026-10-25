import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { OtpModal } from '../components/common/OtpModal'
import { ShareModal } from '../components/common/ShareModal'
import { ToastContext } from '../context/ToastContext'

// Mock api methods to prevent jsdom network calls
vi.mock('../services/api', () => ({
  apiGetPermissions: vi.fn().mockResolvedValue({ permissions: [] }),
  apiGrantPermission: vi.fn().mockResolvedValue({ message: "Granted" }),
  apiRevokePermission: vi.fn().mockResolvedValue({ message: "Revoked" })
}))

describe('TrustVault Employee Features & Modals', () => {
  describe('Email OTP Document-Unlock Modal', () => {
    it('renders 6 digit input boxes and security boundary notice', () => {
      render(
        <OtpModal
          isOpen={true}
          onClose={() => {}}
          documentTitle="Quarterly Tax Report"
          onVerify={() => {}}
        />
      )

      expect(screen.getByText(/Unlock Quarterly Tax Report/i)).toBeDefined()
      expect(screen.getByText(/Security Service Boundary/i)).toBeDefined()

      const digitInputs = screen.getAllByRole('textbox')
      expect(digitInputs.length).toBe(6)
    })

    it('advances focus and calls onVerify with 6-digit passcode', () => {
      const handleVerify = vi.fn()
      render(
        <OtpModal
          isOpen={true}
          onClose={() => {}}
          documentTitle="Financial Audit"
          onVerify={handleVerify}
        />
      )

      const digitInputs = screen.getAllByRole('textbox')
      fireEvent.change(digitInputs[0], { target: { value: '4' } })
      fireEvent.change(digitInputs[1], { target: { value: '8' } })
      fireEvent.change(digitInputs[2], { target: { value: '1' } })
      fireEvent.change(digitInputs[3], { target: { value: '9' } })
      fireEvent.change(digitInputs[4], { target: { value: '2' } })
      fireEvent.change(digitInputs[5], { target: { value: '0' } })

      const submitBtn = screen.getByRole('button', { name: /verify & unlock/i })
      expect(submitBtn.disabled).toBe(false)
      fireEvent.click(submitBtn)

      expect(handleVerify).toHaveBeenCalledWith('481920')
    })
  })

  describe('ShareModal Component', () => {
    it('renders grant form and recipient email input', async () => {
      const mockToast = { showToast: vi.fn(), removeToast: vi.fn() }
      await act(async () => {
        render(
          <ToastContext.Provider value={mockToast}>
            <ShareModal
              isOpen={true}
              onClose={() => {}}
              documentId={1}
              documentName="Confidential Specs"
            />
          </ToastContext.Provider>
        )
      })

      expect(screen.getByText(/Share "Confidential Specs"/i)).toBeDefined()
      expect(screen.getByPlaceholderText(/colleague@trustvault.internal/i)).toBeDefined()
      expect(screen.getByRole('button', { name: /add permission/i })).toBeDefined()
    })
  })
})
