import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { SettingsPage } from './SettingsPage'
import * as api from '../lib/api'
import * as AuthContext from '../context/AuthContext'
import type { User } from '../context/AuthContext'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string
    className?: string
    children: ReactNode
  }) => <a href={to} className={className}>{children}</a>,
}))

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
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
const mockApiPutRequired = vi.mocked(api.apiPutRequired)
const mockUseAuth = vi.mocked(AuthContext.useAuth)

function makeCreator(): User {
  return {
    id: 'creator-1',
    email: 'creator@example.com',
    role: 'creator',
    displayName: 'Creator One',
    username: 'creatorone',
  }
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      currentUser: makeCreator(),
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
    mockApiGetRequired.mockResolvedValue({
      tabs: [
        { key: 'all', label: 'All', visible: true, order: 0 },
        { key: 'posts', label: 'Posts', visible: true, order: 1 },
        { key: 'photography', label: 'Photography', visible: true, order: 2 },
        { key: 'audio', label: 'Audio', visible: true, order: 3 },
        { key: 'articles', label: 'Articles', visible: true, order: 4 },
        { key: 'courses', label: 'Courses', visible: true, order: 5 },
        { key: 'subscribers', label: 'Subscribers', visible: true, order: 6 },
        { key: 'subscribed', label: 'Subscribed to', visible: true, order: 7 },
        { key: 'about', label: 'About', visible: true, order: 8 },
      ],
    })
    mockApiPutRequired.mockImplementation(async (_url, payload) => ({
      tabs: (payload as { tabs: Array<{ key: string; visible: boolean }> }).tabs.map((tab, index) => ({
        ...tab,
        label: tab.key === 'subscribed'
          ? 'Subscribed to'
          : tab.key.charAt(0).toUpperCase() + tab.key.slice(1),
        order: index,
      })),
    }))
  })

  it('renders settings second nav and saves profile tab visibility', async () => {
    const user = userEvent.setup()
    renderSettingsPage('profile-tabs')

    expect((await screen.findByText('Public identity')).closest('a')).toHaveAttribute('href', '/settings/profile')
    expect(screen.getByText('Order and visibility').closest('a')).toHaveAttribute('href', '/settings/profile-tabs')
    expect(await screen.findByText('More menu')).toBeInTheDocument()
    expect(screen.getAllByText('Subscribed to').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('switch', { name: 'Hide About' }))
    await user.click(screen.getByRole('button', { name: 'Save tab settings' }))

    await waitFor(() => {
      expect(mockApiPutRequired).toHaveBeenCalledWith('/api/settings/profile-tabs', {
        tabs: [
          { key: 'all', visible: true },
          { key: 'posts', visible: true },
          { key: 'photography', visible: true },
          { key: 'audio', visible: true },
          { key: 'articles', visible: true },
          { key: 'courses', visible: true },
          { key: 'subscribers', visible: true },
          { key: 'subscribed', visible: true },
          { key: 'about', visible: false },
        ],
      })
    })
  })
})

function renderSettingsPage(section: 'profile' | 'profile-tabs' | 'account' | 'security') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage section={section} />
    </QueryClientProvider>,
  )
}
