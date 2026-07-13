import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DiscoverySettingsPanel } from './DiscoverySettingsPanel'
import * as api from '../lib/api'
import * as AuthContext from '../context/AuthContext'

vi.mock('../lib/api', () => ({ apiGetRequired: vi.fn(), apiPutRequired: vi.fn() }))
vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return { ...actual, useAuth: vi.fn() }
})

describe('DiscoverySettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(AuthContext.useAuth).mockReturnValue({
      currentUser: { id: 'creator', email: 'creator@example.com', displayName: 'Creator', username: 'creator', role: 'creator', adminRole: null },
      isLoading: false, completeOtpSignIn: vi.fn(), logout: vi.fn(), refreshCurrentUser: vi.fn(),
    })
    vi.mocked(api.apiGetRequired).mockResolvedValue({
      categories: [{ id: 'cat-photo', slug: 'photo', name: 'Photography', description: null, displayOrder: 0, creatorCount: 1 }],
      interestCategoryIds: [], creatorCategoryIds: [],
    })
    vi.mocked(api.apiPutRequired).mockResolvedValue({ categoryIds: ['cat-photo'] })
  })

  it('lets creators save private interests and public creator categories independently', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(await screen.findByText('Creator categories')).toBeInTheDocument()
    const categoryButtons = screen.getAllByRole('button', { name: 'Photography' })
    await user.click(categoryButtons[0])
    await user.click(screen.getByRole('button', { name: 'Save interests' }))
    expect(api.apiPutRequired).toHaveBeenCalledWith('/api/discovery/interests', { categoryIds: ['cat-photo'] })
    await user.click(categoryButtons[1])
    await user.click(screen.getByRole('button', { name: 'Save creator categories' }))
    expect(api.apiPutRequired).toHaveBeenCalledWith('/api/discovery/creator-categories', { categoryIds: ['cat-photo'] })
  })
})

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><DiscoverySettingsPanel /></QueryClientProvider>)
}
