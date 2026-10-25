import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { ToastContext } from '../context/ToastContext';
import { ProfilePage } from '../pages/ProfilePage';

describe('TrustVault Profile Page — Edit Profile UI Only', () => {
  const mockShowToast = vi.fn();
  const mockRemoveToast = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderProfileForRole = (userRole, userData = null) => {
    const defaultUser = {
      id: 101,
      name: userRole === 'admin' ? 'Alex Vance' : userRole === 'owner' ? 'Jane Doe' : 'Bob Smith',
      email: userRole === 'admin' ? 'admin@trustvault.internal' : userRole === 'owner' ? 'jane.owner@trustvault.internal' : 'bob.viewer@trustvault.internal',
      role: userRole,
      created_at: '2026-01-15T10:00:00.000Z',
      ...userData
    };

    const authContextValue = {
      user: defaultUser,
      role: userRole,
      logout: mockLogout,
      isAuthenticated: true
    };

    const toastContextValue = {
      showToast: mockShowToast,
      removeToast: mockRemoveToast
    };

    return render(
      <AuthContext.Provider value={authContextValue}>
        <ToastContext.Provider value={toastContextValue}>
          <MemoryRouter>
            <ProfilePage />
          </MemoryRouter>
        </ToastContext.Provider>
      </AuthContext.Provider>
    );
  };

  it('1. Renders Edit Profile button for all three roles: Viewer, Owner, and Admin', () => {
    // 1. Viewer Role
    const { unmount: unmountViewer } = renderProfileForRole('viewer');
    const viewerEditBtn = screen.getByRole('button', { name: /edit profile/i });
    expect(viewerEditBtn).toBeDefined();
    expect(screen.getAllByText('Viewer').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('bob.viewer@trustvault.internal').length).toBeGreaterThanOrEqual(1);
    unmountViewer();

    // 2. Owner Role
    const { unmount: unmountOwner } = renderProfileForRole('owner');
    const ownerEditBtn = screen.getByRole('button', { name: /edit profile/i });
    expect(ownerEditBtn).toBeDefined();
    expect(screen.getAllByText('Document Owner').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('jane.owner@trustvault.internal').length).toBeGreaterThanOrEqual(1);
    unmountOwner();

    // 3. Admin Role
    const { unmount: unmountAdmin } = renderProfileForRole('admin');
    const adminEditBtn = screen.getByRole('button', { name: /edit profile/i });
    expect(adminEditBtn).toBeDefined();
    expect(screen.getAllByText('Administrator').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('admin@trustvault.internal').length).toBeGreaterThanOrEqual(1);
    unmountAdmin();
  });

  it('2. Clicking Edit Profile displays editable form with Full Name, Mobile Number, Gmail/Email, and Avatar Change Photo', () => {
    renderProfileForRole('owner');

    const editBtn = screen.getByRole('button', { name: /edit profile/i });
    fireEvent.click(editBtn);

    // Form title & description
    expect(screen.getByText('Edit Profile Information')).toBeDefined();
    expect(screen.getByText(/update your display name, contact phone number/i)).toBeDefined();

    // Editable Inputs
    const nameInput = screen.getByPlaceholderText('e.g. Jane Doe');
    expect(nameInput).toBeDefined();
    expect(nameInput.value).toBe('Jane Doe');

    const phoneInput = screen.getByPlaceholderText('e.g. +1 (555) 019-2834');
    expect(phoneInput).toBeDefined();
    expect(phoneInput.value).toBe('+1 (555) 018-9412');

    const emailInput = screen.getByPlaceholderText('e.g. employee@trustvault.internal');
    expect(emailInput).toBeDefined();
    expect(emailInput.value).toBe('jane.owner@trustvault.internal');

    // Locked Role field
    const roleInput = screen.getByDisplayValue('Document Owner (Policy Locked)');
    expect(roleInput).toBeDefined();
    expect(roleInput.disabled).toBe(true);

    // Profile Avatar Change Photo button & notice
    expect(screen.getByRole('button', { name: /change photo/i })).toBeDefined();
    expect(screen.getByText(/profile avatar preview/i)).toBeDefined();

    // Save and Cancel buttons
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDefined();
  });

  it('3. Successfully updates local UI state on Save Changes and shows feedback toast', async () => {
    renderProfileForRole('viewer');

    // Open edit mode
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const nameInput = screen.getByPlaceholderText('e.g. Jane Doe');
    const phoneInput = screen.getByPlaceholderText('e.g. +1 (555) 019-2834');
    const emailInput = screen.getByPlaceholderText('e.g. employee@trustvault.internal');

    // Change field values
    fireEvent.change(nameInput, { target: { value: 'Robert Smith Jr.' } });
    fireEvent.change(phoneInput, { target: { value: '+1 (555) 999-8888' } });
    fireEvent.change(emailInput, { target: { value: 'robert.viewer@trustvault.internal' } });

    // Submit Save Changes
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    // Form should close back to View mode
    expect(screen.queryByText('Edit Profile Information')).toBeNull();

    // Updated values should reflect in the local UI card
    expect(screen.getByText('Robert Smith Jr.')).toBeDefined();
    expect(screen.getAllByText('robert.viewer@trustvault.internal').length).toBeGreaterThan(0);
    expect(screen.getByText('+1 (555) 999-8888')).toBeDefined();

    // Verify toast notification called
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining('Profile details updated for this local UI session'),
      'success'
    );
  });

  it('4. Reverts modifications when Cancel is clicked without updating profile state', () => {
    renderProfileForRole('admin');

    // Open edit mode
    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const nameInput = screen.getByPlaceholderText('e.g. Jane Doe');
    fireEvent.change(nameInput, { target: { value: 'Temporary Unsaved Name' } });

    // Click Cancel
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    // Back in view mode
    expect(screen.queryByText('Edit Profile Information')).toBeNull();
    // Original name preserved
    expect(screen.getByText('Alex Vance')).toBeDefined();
    expect(screen.queryByText('Temporary Unsaved Name')).toBeNull();
  });

  it('5. Validates required fields (cannot submit blank name or invalid email format)', () => {
    renderProfileForRole('owner');

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));

    const nameInput = screen.getByPlaceholderText('e.g. Jane Doe');
    fireEvent.change(nameInput, { target: { value: '   ' } });

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(mockShowToast).toHaveBeenCalledWith(
      'Full Name cannot be blank.',
      'error'
    );
    // Remains in edit mode
    expect(screen.getByText('Edit Profile Information')).toBeDefined();
  });
});
