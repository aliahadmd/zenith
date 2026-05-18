import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    params?: { username?: string; slug?: string }
    className?: string
    children: ReactNode
  }) => {
    const href = to
      .replace('$username', params?.username ?? '')
      .replace('$slug', params?.slug ?? '')
    return <a href={href} className={className}>{children}</a>
  },
}))

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
  apiDeleteRequired: vi.fn(),
  apiPostRequired: vi.fn(),
  apiPutRequired: vi.fn(),
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
      currentUser: { ...makeUser(), id: 'creator-1', role: 'creator', username: 'creatorone' },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
    mockApiGetRequired.mockImplementation(async (url) => {
      if (String(url).endsWith('/subscriptions')) {
        return { subscriptions: [] }
      }

      if (String(url).endsWith('/subscribers')) {
        return {
          subscribers: [
            {
              displayName: 'Member One',
              username: 'memberone',
              avatarUrl: null,
              status: 'active',
              accessType: 'paid',
              trialEndsAt: null,
              createdAt: 1_700_000_000,
            },
          ],
        }
      }

      if (String(url).endsWith('/posts')) {
        return {
          hasAccess: true,
          posts: [
            {
              id: 'post-1',
              slug: 'first-member-update',
              body: 'First member update',
              createdAt: 1_700_000_000,
              author: {
                id: 'creator-1',
                displayName: 'Creator One',
                username: 'creatorone',
                avatarUrl: null,
              },
              attachments: [],
              likeCount: 2,
              replyCount: 1,
              viewerLiked: false,
              poll: null,
            },
          ],
        }
      }

      if (String(url).endsWith('/articles')) {
        return {
          hasAccess: true,
          articles: [],
        }
      }

      if (String(url).endsWith('/photography')) {
        return {
          hasAccess: true,
          albums: [],
          photos: [],
        }
      }

      if (String(url).endsWith('/audio')) {
        return {
          hasAccess: true,
          items: [],
          albums: [],
          episodes: [],
          podcasts: [],
        }
      }

      return {
        id: 'creator-1',
        displayName: 'Creator One',
        username: 'creatorone',
        role: 'creator',
        tagline: 'Design notes and field guides.',
        avatarUrl: null,
        profileTabs: null,
        socialLinks: JSON.stringify({
          github: 'https://github.com/creatorone',
          twitter: 'https://x.com/creatorone',
          website: 'https://creator.example',
        }),
      }
    })
  })

  it('renders profile social links as accessible icon links', async () => {
    const user = userEvent.setup()
    renderProfilePage()

    await user.click(await screen.findByRole('tab', { name: 'About' }))

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

  it('adds creator posts, photography, audio, and subscribers tabs', async () => {
    const user = userEvent.setup()
    renderProfilePage()

    expect(await screen.findByRole('tab', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Photography' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audio' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Subscribers' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Posts' }))
    expect(await screen.findByText('First member update')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /more/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Subscribers' }))
    expect(await screen.findByText('Member One')).toBeInTheDocument()
    expect(screen.getByText('@memberone')).toBeInTheDocument()
  })

  it('keeps overflow creator tabs inside the More menu', async () => {
    const user = userEvent.setup()
    renderProfilePage()

    expect(await screen.findByRole('tab', { name: 'About' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Photography' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Audio' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Articles' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Subscribers' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Subscribed to' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /more/i }))
    expect(await screen.findByRole('menuitem', { name: 'Articles' })).toBeInTheDocument()
    expect(await screen.findByRole('menuitem', { name: 'Subscribers' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Subscribed to' })).toBeInTheDocument()
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
