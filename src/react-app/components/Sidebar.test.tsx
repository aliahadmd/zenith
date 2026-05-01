import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Become Creator' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Studio' })).not.toBeInTheDocument()
  })

  it('renders "Studio" link for a creator', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('creator'),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar()

    expect(screen.getByRole('link', { name: 'Studio' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Become Creator' })).not.toBeInTheDocument()
  })

  it('applies active-link class when the current route matches the nav link', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('subscriber'),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    // Start on /become-creator so that link is active
    renderSidebar('/become-creator')

    const becomeCreatorLink = screen.getByRole('link', { name: 'Become Creator' })
    // Active links get bg-accent and text-accent-foreground classes
    expect(becomeCreatorLink).toHaveClass('bg-accent')
    expect(becomeCreatorLink).toHaveClass('text-accent-foreground')
  })

  it('applies active-link class to Studio link when on /studio as creator', () => {
    mockUseAuth.mockReturnValue({
      currentUser: makeUser('creator'),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    renderSidebar('/studio')

    const studioLink = screen.getByRole('link', { name: 'Studio' })
    expect(studioLink).toHaveClass('bg-accent')
    expect(studioLink).toHaveClass('text-accent-foreground')
  })
})
