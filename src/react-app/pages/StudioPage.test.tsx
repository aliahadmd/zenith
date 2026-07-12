import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StudioPage } from './StudioPage'
import * as AuthContext from '../context/AuthContext'

const navigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, className, children }: { to: string; className?: string; children: ReactNode }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useNavigate: () => navigateMock,
  useRouterState: () => '/studio',
}))

// Mock the api module (ShortPostComposer uses apiPostRequired)
vi.mock('../lib/api', () => ({
  apiPostRequired: vi.fn(),
  apiGetRequired: vi.fn().mockResolvedValue({ items: [] }),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('StudioPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      currentUser: {
        id: 'creator-1',
        email: 'creator@example.com',
        role: 'creator',
        displayName: 'Creator One',
        username: 'creatorone',
        adminRole: null,
        avatarUrl: null,
      },
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  // Validates: Requirements 6.1, 6.4
  it('renders all five content-type cards', () => {
    renderStudioPage()

    expect(screen.getByRole('button', { name: /^post/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^article/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^audio/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^photography/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^course/i })).toBeInTheDocument()
  })

  it('renders Studio-local navigation', () => {
    renderStudioPage()

    expect(screen.getAllByRole('navigation', { name: /studio sections/i })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /create/i })[0]).toHaveAttribute('href', '/studio')
    expect(screen.getAllByRole('link', { name: /articles/i })[0]).toHaveAttribute('href', '/studio/articles/new')
    expect(screen.getAllByRole('link', { name: /subscriptions/i })[0]).toHaveAttribute('href', '/studio/subscriptions')
    expect(screen.getAllByRole('link', { name: /money/i })[0]).toHaveAttribute('href', '/studio/payouts')
  })

  // Validates: Requirements 6.4
  it('renders each card with a description', () => {
    renderStudioPage()

    expect(screen.getByText(/share a quick thought/i)).toBeInTheDocument()
    expect(screen.getByText(/in-depth article/i)).toBeInTheDocument()
    expect(screen.getByText(/structured multi-lesson course/i)).toBeInTheDocument()
  })

  // Validates: Requirements 6.2
  it('"Article" card opens the article editor route', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    await user.click(screen.getByRole('button', { name: /article/i }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/studio/articles/new' })
  })

  it('"Course" card opens the course studio route', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    await user.click(screen.getByRole('button', { name: /course/i }))

    expect(navigateMock).toHaveBeenCalledWith({ to: '/studio/courses' })
  })

  // Validates: Requirements 6.3
  it('clicking "Short Post" card opens the ShortPostComposer modal', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    // Composer should not be visible initially
    expect(screen.queryByRole('dialog', { name: /short post composer/i })).not.toBeInTheDocument()

    // Click the Short Post card (it has role="button")
    await user.click(screen.getByRole('button', { name: /^post/i }))

    // Composer modal should now be open
    expect(screen.getByRole('dialog', { name: /short post composer/i })).toBeInTheDocument()
  })

  // Validates: Requirements 6.3
  it('closing the composer hides it again', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    // Open the composer
    await user.click(screen.getByRole('button', { name: /^post/i }))
    expect(screen.getByRole('dialog', { name: /short post composer/i })).toBeInTheDocument()

    // Close via the Cancel button
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog', { name: /short post composer/i })).not.toBeInTheDocument()
  })

  it('clicking "Article" card does not open the post composer', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    await user.click(screen.getByRole('button', { name: /article/i }))

    // Composer should remain closed
    expect(screen.queryByRole('dialog', { name: /short post composer/i })).not.toBeInTheDocument()
  })
})

function renderStudioPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StudioPage />
    </QueryClientProvider>,
  )
}
