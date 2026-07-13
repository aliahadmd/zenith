import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ExplorePage, type ExploreSearch } from './ExplorePage'
import * as api from '../lib/api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: ReactNode; params: { username: string } }) => <a href={`/u/${params.username}`}>{children}</a>,
}))
vi.mock('../lib/api', () => ({ apiGetRequired: vi.fn(), apiPutRequired: vi.fn() }))

const get = vi.mocked(api.apiGetRequired)
const put = vi.mocked(api.apiPutRequired)
const categories = [
  { id: 'cat-photography', slug: 'photography', name: 'Photography', description: null, displayOrder: 0, creatorCount: 1 },
  { id: 'cat-business', slug: 'business', name: 'Business', description: null, displayOrder: 1, creatorCount: 0 },
]
const creator = {
  id: 'creator-1', displayName: 'Creator One', username: 'creatorone', tagline: 'Visual field notes.', avatarUrl: null,
  categories: [{ id: 'cat-photography', slug: 'photography', name: 'Photography' }], publishedContentCount: 3,
  contentTypes: ['photography' as const, 'article' as const], featured: false, viewerSubscribed: false,
  recommendationReason: 'Matches your Photography interest',
}

describe('ExplorePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({ categories, featured: [], recommended: [creator], interests: [], needsInterests: true })
    put.mockResolvedValue({ categoryIds: ['cat-photography'] })
  })

  it('renders recommendations and saves cold-start interests', async () => {
    const user = userEvent.setup()
    renderExplore({ q: '', category: '', sort: 'relevance', page: 1 })
    expect(await screen.findByRole('heading', { name: 'Recommended for you' })).toBeInTheDocument()
    expect(screen.getByText('Creator One')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view profile/i })).toHaveAttribute('href', '/u/creatorone')
    await user.click(screen.getByRole('button', { name: 'Photography', pressed: false }))
    await user.click(screen.getByRole('button', { name: 'Save interests' }))
    expect(put).toHaveBeenCalledWith('/api/discovery/interests', { categoryIds: ['cat-photography'] })
  })

  it('renders the filtered empty state and clears URL-backed filters', async () => {
    get.mockImplementation(async (url) => String(url).includes('/creators?')
      ? { creators: [], total: 0, page: 1, pageSize: 20 }
      : { categories, featured: [], recommended: [], interests: [], needsInterests: false })
    const onSearchChange = vi.fn()
    renderExplore({ q: 'missing', category: '', sort: 'relevance', page: 1 }, onSearchChange)
    expect(await screen.findByText('No creators match')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onSearchChange).toHaveBeenCalledWith({ q: '', category: '', sort: 'relevance', page: 1 })
  })
})

function renderExplore(search: ExploreSearch, onSearchChange = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ExplorePage search={search} onSearchChange={onSearchChange} /></QueryClientProvider>)
}
