import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Button from '../components/common/Button'
import Badge from '../components/common/Badge'
import Card from '../components/common/Card'
import EmptyState from '../components/common/EmptyState'
import Input from '../components/common/Input'
import { formatFileSize, formatDate, getRoleBadgeVariant } from '../services/mockData'

describe('TrustVault Frontend UI Components', () => {
  describe('Button Component', () => {
    it('renders with children text and default primary variant', () => {
      render(<Button>Submit Document</Button>)
      const button = screen.getByRole('button', { name: /submit document/i })
      expect(button).toBeDefined()
      expect(button.className).toContain('btn-primary')
    })

    it('renders with pill variant matching Snovasys hackathon theme', () => {
      render(<Button variant="pill">Problem Statement</Button>)
      const button = screen.getByRole('button', { name: /problem statement/i })
      expect(button.className).toContain('btn-pill')
    })

    it('triggers onClick event when clicked', () => {
      const handleClick = vi.fn()
      render(<Button onClick={handleClick}>Click Me</Button>)
      const button = screen.getByRole('button', { name: /click me/i })
      fireEvent.click(button)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('is disabled and prevents click events when disabled prop is true', () => {
      const handleClick = vi.fn()
      render(<Button disabled onClick={handleClick}>Disabled Action</Button>)
      const button = screen.getByRole('button', { name: /disabled action/i })
      expect(button.disabled).toBe(true)
      fireEvent.click(button)
      expect(handleClick).not.toHaveBeenCalled()
    })

    it('displays loading state and disables interaction', () => {
      render(<Button loading>Uploading</Button>)
      const button = screen.getByRole('button')
      expect(button.disabled).toBe(true)
      expect(button.textContent).toContain('Uploading')
    })
  })

  describe('Badge Component', () => {
    it('renders role and status badges correctly', () => {
      const { container: c1 } = render(<Badge variant="admin">Admin</Badge>)
      expect(c1.textContent.toUpperCase()).toContain('ADMIN')

      const { container: c2 } = render(<Badge variant="success">Active</Badge>)
      expect(c2.textContent.toUpperCase()).toContain('SUCCESS')

      const { container: c3 } = render(<Badge variant="error">Revoked</Badge>)
      expect(c3.textContent).toBeDefined()
    })

    it('maps backend roles to appropriate badge variants', () => {
      expect(getRoleBadgeVariant('admin')).toBe('admin')
      expect(getRoleBadgeVariant('owner')).toBe('owner')
      expect(getRoleBadgeVariant('viewer')).toBe('viewer')
      expect(getRoleBadgeVariant('unknown')).toBe('default')
    })
  })

  describe('Card Component', () => {
    it('renders title, description and children', () => {
      render(
        <Card title="How it works" subtitle="Three steps to submit your project">
          <p>Card body content</p>
        </Card>
      )
      expect(screen.getByText('How it works')).toBeDefined()
      expect(screen.getByText('Three steps to submit your project')).toBeDefined()
      expect(screen.getByText('Card body content')).toBeDefined()
    })

    it('applies signature dotted border style when dotted prop is true', () => {
      const { container } = render(
        <Card dotted title="Instructions">
          Content
        </Card>
      )
      const cardEl = container.firstChild
      expect(cardEl.className).toContain('card-dotted')
    })
  })

  describe('Input Component', () => {
    it('renders label, input and handles change events', () => {
      const handleChange = vi.fn()
      render(
        <Input
          label="Document Title"
          name="title"
          placeholder="Enter title"
          onChange={handleChange}
        />
      )
      expect(screen.getByText('Document Title')).toBeDefined()
      const input = screen.getByPlaceholderText('Enter title')
      fireEvent.change(input, { target: { value: 'Financial Report 2026' } })
      expect(handleChange).toHaveBeenCalled()
    })

    it('displays validation error message when error prop is provided', () => {
      render(
        <Input
          label="Email Address"
          name="email"
          error="Valid email address is required"
        />
      )
      expect(screen.getByText('Valid email address is required')).toBeDefined()
    })
  })

  describe('EmptyState Component', () => {
    it('renders empty message and optional action button', () => {
      const handleAction = vi.fn()
      render(
        <EmptyState
          title="No documents found"
          description="You have not uploaded any secure documents yet."
          actionText="Upload Document"
          onAction={handleAction}
        />
      )
      expect(screen.getByText('No documents found')).toBeDefined()
      expect(screen.getByText('You have not uploaded any secure documents yet.')).toBeDefined()
      const button = screen.getByRole('button', { name: /upload document/i })
      fireEvent.click(button)
      expect(handleAction).toHaveBeenCalledTimes(1)
    })
  })

  describe('Data Formatting Utilities', () => {
    it('formats file sizes into human-readable bytes, KB, MB', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1048576)).toBe('1.0 MB')
      expect(formatFileSize(5242880)).toBe('5.0 MB')
    })

    it('formats timestamps cleanly', () => {
      const formatted = formatDate('2026-10-18T20:00:00Z')
      expect(formatted).not.toBe('—')
      expect(typeof formatted).toBe('string')
      expect(formatDate(null)).toBe('—')
    })
  })
})
