import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ProfilePage } from './ProfilePage'
import * as api from '../lib/api'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'

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
}))

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
}))

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

const mockApiGetRequired = vi.mocked(api.apiGetRequired)
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

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      currentUser: makeUser(),
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
    mockApiGetRequired.mockImplementation(async (url) => {
      if (String(url).endsWith('/subscriptions')) {
        return { subscriptions: [] }
      }

      return {
        id: 'creator-1',
        displayName: 'Creator One',
        username: 'creatorone',
        tagline: 'Design notes and field guides.',
        avatarUrl: null,
        socialLinks: JSON.stringify({
          github: 'https://github.com/creatorone',
          twitter: 'https://x.com/creatorone',
          website: 'https://creator.example',
        }),
      }
    })
  })

  it('renders profile social links as accessible icon links', async () => {
    renderProfilePage()

    expect(await screen.findByRole('link', { name: 'Open GitHub profile' })).toHaveAttribute(
      'href',
      'https://github.com/creatorone',
    )
    expect(screen.getByRole('link', { name: 'Open X profile' })).toHaveAttribute(
      'href',
      'https://x.com/creatorone',
    )
    expect(screen.getByRole('link', { name: 'Open Website profile' })).toHaveAttribute(
      'href',
      'https://creator.example',
    )
    expect(screen.queryByRole('link', { name: 'github' })).not.toBeInTheDocument()
  })
})

function renderProfilePage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ProfilePage username="creatorone" />
    </QueryClientProvider>,
  )
}
