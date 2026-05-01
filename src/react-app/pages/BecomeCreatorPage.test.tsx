import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router'
import { BecomeCreatorPage } from './BecomeCreatorPage'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'
import * as api from '../lib/api'

// Mock useAuth
vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

// Mock the api module
vi.mock('../lib/api', () => ({
  apiPost: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

// Mock sonner toast to avoid side effects
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockUseAuth = vi.mocked(AuthContext.useAuth)
const mockApiPost = vi.mocked(api.apiPost)

function makeUser(role: 'subscriber' | 'creator'): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role,
    displayName: 'Test User',
    username: 'testuser',
  }
}

function renderPage(initialPath = '/become-creator') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/become-creator" element={<BecomeCreatorPage />} />
        <Route path="/studio" element={<div>Studio Page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('BecomeCreatorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  // ── Test 1: All required fields are rendered ──────────────────────────────
  // Validates: Requirements 2.1, 2.3
  it('renders all required form fields for a subscriber', () => {
    renderPage()

    // Identity fields
    expect(screen.getByLabelText(/full legal name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/street address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/country/i)).toBeInTheDocument()

    // NID fields
    expect(screen.getByLabelText(/nid number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/nid document image/i)).toBeInTheDocument()

    // Social and content URL fields
    expect(screen.getByLabelText(/social profile url 1/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/content sample url 1/i)).toBeInTheDocument()

    // Submit button
    expect(screen.getByRole('button', { name: /submit application/i })).toBeInTheDocument()
  })

  // ── Test 2: Read-only status message when application already exists (409) ─
  // Validates: Requirements 2.8, 4.1
  it('shows "Application Under Review" message when apiPost returns 409', async () => {
    const user = userEvent.setup()

    mockApiPost.mockResolvedValue({ data: null, error: 'Application already submitted', status: 409 })

    renderPage()

    // Fill in all required text fields
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/street address/i), '123 Main St')
    await user.type(screen.getByLabelText(/city/i), 'Springfield')
    await user.type(screen.getByLabelText(/country/i), 'USA')
    await user.type(screen.getByLabelText(/nid number/i), 'NID-12345')
    await user.type(screen.getByLabelText(/social profile url 1/i), 'https://twitter.com/janedoe')
    await user.type(screen.getByLabelText(/content sample url 1/i), 'https://youtube.com/watch?v=abc')

    // Upload a fake NID document file
    const nidInput = screen.getByLabelText(/nid document image/i)
    const fakeFile = new File(['fake image content'], 'nid.jpg', { type: 'image/jpeg' })
    await user.upload(nidInput, fakeFile)

    // Submit the form
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    // The form should be replaced with the "Application Under Review" card
    await waitFor(() => {
      expect(screen.getByText('Application Under Review')).toBeInTheDocument()
    })

    // The form should no longer be visible
    expect(screen.queryByRole('button', { name: /submit application/i })).not.toBeInTheDocument()
    expect(screen.getByText(/you have already submitted a creator application/i)).toBeInTheDocument()
  })

  // ── Test 3: Field-level validation errors on empty submit ─────────────────
  // Validates: Requirements 2.4, 4.2
  it('shows field-level validation errors when form is submitted empty', async () => {
    const user = userEvent.setup()

    renderPage()

    // Submit without filling in any fields
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    // Validation errors should appear for required fields
    await waitFor(() => {
      expect(screen.getByText('Full legal name is required')).toBeInTheDocument()
    })

    expect(screen.getByText('Street address is required')).toBeInTheDocument()
    expect(screen.getByText('City is required')).toBeInTheDocument()
    expect(screen.getByText('Country is required')).toBeInTheDocument()
    expect(screen.getByText('NID number is required')).toBeInTheDocument()

    // apiPost should NOT have been called
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  // ── Test 4: Successful submit triggers refreshCurrentUser and navigation ───
  // Validates: Requirements 2.1, 4.1, 4.2
  it('calls refreshCurrentUser and navigates to /studio on successful submit', async () => {
    const user = userEvent.setup()
    const mockRefreshCurrentUser = vi.fn().mockResolvedValue(undefined)

    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: mockRefreshCurrentUser,
    })

    mockApiPost.mockResolvedValue({ data: { role: 'creator' }, error: null, status: 201 })

    renderPage()

    // Fill in all required text fields
    await user.type(screen.getByLabelText(/full legal name/i), 'Jane Doe')
    await user.type(screen.getByLabelText(/street address/i), '123 Main St')
    await user.type(screen.getByLabelText(/city/i), 'Springfield')
    await user.type(screen.getByLabelText(/country/i), 'USA')
    await user.type(screen.getByLabelText(/nid number/i), 'NID-12345')
    await user.type(screen.getByLabelText(/social profile url 1/i), 'https://twitter.com/janedoe')
    await user.type(screen.getByLabelText(/content sample url 1/i), 'https://youtube.com/watch?v=abc')

    // Upload a fake NID document file
    const nidInput = screen.getByLabelText(/nid document image/i)
    const fakeFile = new File(['fake image content'], 'nid.jpg', { type: 'image/jpeg' })
    await user.upload(nidInput, fakeFile)

    // Submit the form
    await user.click(screen.getByRole('button', { name: /submit application/i }))

    // refreshCurrentUser should be called
    await waitFor(() => {
      expect(mockRefreshCurrentUser).toHaveBeenCalledOnce()
    })

    // Should navigate to /studio
    await waitFor(() => {
      expect(screen.getByText('Studio Page')).toBeInTheDocument()
    })
  })
})
