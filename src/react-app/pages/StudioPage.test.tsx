import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StudioPage } from './StudioPage'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, className, children }: { to: string; className?: string; children: ReactNode }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useRouterState: () => '/studio',
}))

// Mock the api module (ShortPostComposer uses apiPostRequired)
vi.mock('../lib/api', () => ({
  apiPostRequired: vi.fn(),
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

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
  })

  // Validates: Requirements 6.1, 6.4
  it('renders all three content-type cards', () => {
    renderStudioPage()

    expect(screen.getByText('Short Post')).toBeInTheDocument()
    expect(screen.getByText('Long Post')).toBeInTheDocument()
    expect(screen.getByText('Course')).toBeInTheDocument()
  })

  it('renders Studio-local navigation', () => {
    renderStudioPage()

    expect(screen.getAllByRole('navigation', { name: /studio sections/i })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /create/i })[0]).toHaveAttribute('href', '/studio')
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
  it('"Long Post" card is in disabled/coming-soon state', () => {
    renderStudioPage()

    // The "Coming Soon" badge should appear for Long Post
    const comingSoonBadges = screen.getAllByText('Coming Soon')
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(1)

    // The Long Post card should have aria-disabled
    const longPostCard = screen.getByText('Long Post').closest('[aria-disabled]')
    expect(longPostCard).toHaveAttribute('aria-disabled', 'true')
  })

  // Validates: Requirements 6.2
  it('"Course" card is in disabled/coming-soon state', () => {
    renderStudioPage()

    const courseCard = screen.getByText('Course').closest('[aria-disabled]')
    expect(courseCard).toHaveAttribute('aria-disabled', 'true')

    // Two "Coming Soon" badges — one for Long Post, one for Course
    const comingSoonBadges = screen.getAllByText('Coming Soon')
    expect(comingSoonBadges).toHaveLength(2)
  })

  // Validates: Requirements 6.3
  it('clicking "Short Post" card opens the ShortPostComposer modal', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    // Composer should not be visible initially
    expect(screen.queryByRole('dialog', { name: /short post composer/i })).not.toBeInTheDocument()

    // Click the Short Post card (it has role="button")
    const shortPostCard = screen.getByRole('button', { name: /short post/i })
    await user.click(shortPostCard)

    // Composer modal should now be open
    expect(screen.getByRole('dialog', { name: /short post composer/i })).toBeInTheDocument()
  })

  // Validates: Requirements 6.3
  it('closing the composer hides it again', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    // Open the composer
    await user.click(screen.getByRole('button', { name: /short post/i }))
    expect(screen.getByRole('dialog', { name: /short post composer/i })).toBeInTheDocument()

    // Close via the Cancel button
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog', { name: /short post composer/i })).not.toBeInTheDocument()
  })

  // Validates: Requirements 6.2 — disabled cards do not open the composer
  it('clicking "Long Post" card does not open the composer', async () => {
    const user = userEvent.setup()
    renderStudioPage()

    // Long Post card is disabled — it has no role="button"
    const longPostCard = screen.getByText('Long Post').closest('.relative')
    expect(longPostCard).toBeInTheDocument()

    // Attempt to click the card element directly
    if (longPostCard) {
      await user.click(longPostCard)
    }

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
