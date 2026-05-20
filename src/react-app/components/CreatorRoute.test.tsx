import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CreatorRoute } from './CreatorRoute'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'

vi.mock('@tanstack/react-router', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div>{to === '/login' ? 'Login Page' : 'Become Creator Page'}</div>
  ),
}))

// Mock the useAuth hook
vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(AuthContext.useAuth)

function makeUser(role: 'subscriber' | 'creator'): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role,
    displayName: 'Test User',
    username: 'testuser',
  }
}

/**
 * Renders CreatorRoute inside a MemoryRouter with:
 * - /protected  → the route guarded by CreatorRoute (renders <Outlet />)
 * - /login      → login page sentinel
 * - /become-creator → become-creator page sentinel
 *
 * Starting path is /protected so the guard is exercised immediately.
 */
function renderCreatorRoute() {
  return render(<CreatorRoute><div>Protected Content</div></CreatorRoute>)
}

describe('CreatorRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a loading spinner while auth is loading', () => {
    mockUseAuth.mockReturnValue({
      currentUser: null,
      isLoading: true,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    const { container } = renderCreatorRoute()

    // The spinner div has animate-spin class
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('redirects to /login when there is no authenticated user', () => {
    mockUseAuth.mockReturnValue({
      currentUser: null,
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderCreatorRoute()

    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('redirects to /become-creator when the user is a subscriber', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderCreatorRoute()

    expect(screen.getByText('Become Creator Page')).toBeInTheDocument()
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument()
  })

  it('renders the outlet when the user is a creator', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('creator'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderCreatorRoute()

    expect(screen.getByText('Protected Content')).toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Become Creator Page')).not.toBeInTheDocument()
  })
})
