import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { AppShell } from './AppShell'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'

let mockPathname = '/feed'
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Outlet: () => <div>Page Content</div>,
  Link: ({
    to,
    params,
    className,
    onClick,
    children,
  }: {
    to: string
    params?: { username?: string }
    className?: string
    onClick?: () => void
    children: ReactNode
  }) => {
    const href = params?.username ? to.replace('$username', params.username) : to
    return <a href={href} className={className} onClick={onClick}>{children}</a>
  },
  useRouterState: () => mockPathname,
  useNavigate: () => mockNavigate,
}))

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(AuthContext.useAuth)

function makeUser(): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    role: 'subscriber',
    displayName: 'Test User',
    username: 'testuser',
  }
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname = '/feed'
    mockUseAuth.mockReturnValue({
      currentUser: makeUser(),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  it('renders mobile navigation in a Sheet', async () => {
    const user = userEvent.setup()
    render(<AppShell />)

    expect(screen.getByRole('button', { name: /open navigation/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open navigation/i }))

    expect(screen.getByRole('dialog', { name: /navigation/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Feed' }).length).toBeGreaterThanOrEqual(1)
  })

  it('redirects to login when the authenticated shell loses the user', () => {
    mockUseAuth.mockReturnValue({
      currentUser: null,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })

    render(<AppShell />)

    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login', replace: true })
  })
})
