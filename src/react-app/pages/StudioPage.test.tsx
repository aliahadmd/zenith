import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StudioPage } from './StudioPage'

// Mock the api module (ShortPostComposer uses apiPost)
vi.mock('../lib/api', () => ({
  apiPost: vi.fn(),
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
    render(<StudioPage />)

    expect(screen.getByText('Short Post')).toBeInTheDocument()
    expect(screen.getByText('Long Post')).toBeInTheDocument()
    expect(screen.getByText('Course')).toBeInTheDocument()
  })

  // Validates: Requirements 6.4
  it('renders each card with a description', () => {
    render(<StudioPage />)

    expect(screen.getByText(/share a quick thought/i)).toBeInTheDocument()
    expect(screen.getByText(/in-depth article/i)).toBeInTheDocument()
    expect(screen.getByText(/structured multi-lesson course/i)).toBeInTheDocument()
  })

  // Validates: Requirements 6.2
  it('"Long Post" card is in disabled/coming-soon state', () => {
    render(<StudioPage />)

    // The "Coming Soon" badge should appear for Long Post
    const comingSoonBadges = screen.getAllByText('Coming Soon')
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(1)

    // The Long Post card should have aria-disabled
    const longPostCard = screen.getByText('Long Post').closest('[aria-disabled]')
    expect(longPostCard).toHaveAttribute('aria-disabled', 'true')
  })

  // Validates: Requirements 6.2
  it('"Course" card is in disabled/coming-soon state', () => {
    render(<StudioPage />)

    const courseCard = screen.getByText('Course').closest('[aria-disabled]')
    expect(courseCard).toHaveAttribute('aria-disabled', 'true')

    // Two "Coming Soon" badges — one for Long Post, one for Course
    const comingSoonBadges = screen.getAllByText('Coming Soon')
    expect(comingSoonBadges).toHaveLength(2)
  })

  // Validates: Requirements 6.3
  it('clicking "Short Post" card opens the ShortPostComposer modal', async () => {
    const user = userEvent.setup()
    render(<StudioPage />)

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
    render(<StudioPage />)

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
    render(<StudioPage />)

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
