import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'

let mockPathname = '/feed'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    className,
    children,
  }: {
    to: string
    params?: { username?: string }
    className?: string
    children: ReactNode
  }) => {
    const href = params?.username ? to.replace('$username', params.username) : to
    return <a href={href} className={className}>{children}</a>
  },
  useRouterState: () => mockPathname,
}))

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn(() => ({ data: { count: 0 } })),
  }
})

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
    adminRole: null,
  }
}

function renderSidebar(initialPath = '/feed') {
  mockPathname = initialPath
  return render(<Sidebar />)
}

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders "Become Creator" link for a subscriber', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Feed' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profile' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Become Creator' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Logout' }).querySelector('svg')).toBeInTheDocument()
  })

  it('orders Feed before Profile in the main navigation', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    const linkNames = screen.getAllByRole('link').map((link) => link.textContent)
    expect(linkNames).toEqual(['Feed', 'Library', 'Profile', 'Notifications', 'Become Creator', 'Settings'])
  })

  it('renders creator workspace entry for a creator', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('creator'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Feed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Subscriptions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Money' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Become Creator' })).not.toBeInTheDocument()
  })

  it('applies active-link class when the current route matches the nav link', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    // Start on /become-creator so that link is active
    renderSidebar('/become-creator')

    const becomeCreatorLink = screen.getByRole('link', { name: 'Become Creator' })
    expect(becomeCreatorLink).toHaveClass('text-foreground')
    expect(becomeCreatorLink).toHaveClass('before:bg-primary')
  })

  it('applies active-link class to Studio link when on /studio as creator', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('creator'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar('/studio')

    const studioLink = screen.getByRole('link', { name: 'Studio' })
    expect(studioLink).toHaveClass('text-foreground')
    expect(studioLink).toHaveClass('before:bg-primary')
  })

  it('calls logout when the logout button is clicked', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout,
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    await user.click(screen.getByRole('button', { name: 'Logout' }))

    expect(logout).toHaveBeenCalledTimes(1)
  })
})
