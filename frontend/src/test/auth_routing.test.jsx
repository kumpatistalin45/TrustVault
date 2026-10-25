import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ProtectedRoute, AdminRoute } from '../routes/AppRoutes'
import { AuthContext } from '../context/AuthContext'

describe('TrustVault Frontend Routing & Access Control', () => {
  it('redirects unauthenticated user to /login', () => {
    const mockAuthContext = {
      user: null,
      loading: false,
      login: () => {},
      logout: () => {},
      isAdmin: false,
      isOwner: false,
      isViewer: false
    }

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/login" element={<div>Login Page Screen</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    expect(screen.getByText('Login Page Screen')).toBeDefined()
    expect(screen.queryByText('Secret Dashboard Content')).toBeNull()
  })

  it('allows authenticated user through ProtectedRoute', () => {
    const mockAuthContext = {
      user: { id: 2, name: 'Jane Doe', email: 'jane@trustvault.internal', role: 'owner' },
      isAuthenticated: true,
      loading: false,
      login: () => {},
      logout: () => {},
      isAdmin: false,
      isOwner: true,
      isViewer: false
    }

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route path="/login" element={<div>Login Page Screen</div>} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>Secret Dashboard Content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    expect(screen.getByText('Secret Dashboard Content')).toBeDefined()
    expect(screen.queryByText('Login Page Screen')).toBeNull()
  })

  it('blocks non-admin users from AdminRoute and redirects to /403', () => {
    const mockAuthContext = {
      user: { id: 3, name: 'Bob Smith', email: 'bob@trustvault.internal', role: 'viewer' },
      loading: false,
      login: () => {},
      logout: () => {},
      isAdmin: false,
      isOwner: false,
      isViewer: true
    }

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <MemoryRouter initialEntries={['/audit']}>
          <Routes>
            <Route path="/access-denied" element={<div>403 Access Denied Screen</div>} />
            <Route
              path="/audit"
              element={
                <AdminRoute>
                  <div>Secret Audit Records</div>
                </AdminRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    expect(screen.getByText('403 Access Denied Screen')).toBeDefined()
    expect(screen.queryByText('Secret Audit Records')).toBeNull()
  })

  it('allows administrator to access AdminRoute', () => {
    const mockAuthContext = {
      user: { id: 1, name: 'Alex Vance', email: 'admin@trustvault.internal', role: 'admin' },
      isAuthenticated: true,
      loading: false,
      login: () => {},
      logout: () => {},
      isAdmin: true,
      isOwner: false,
      isViewer: false
    }

    render(
      <AuthContext.Provider value={mockAuthContext}>
        <MemoryRouter initialEntries={['/audit']}>
          <Routes>
            <Route path="/403" element={<div>403 Access Denied Screen</div>} />
            <Route
              path="/audit"
              element={
                <AdminRoute>
                  <div>Secret Audit Records</div>
                </AdminRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )

    expect(screen.getByText('Secret Audit Records')).toBeDefined()
    expect(screen.queryByText('403 Access Denied Screen')).toBeNull()
  })
})
