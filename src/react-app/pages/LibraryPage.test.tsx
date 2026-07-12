import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LibraryPage } from './LibraryPage'
import * as api from '../lib/api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, params }: { children: ReactNode; to: string; params?: Record<string, string> }) => (
    <a href={to.replace('$username', params?.username ?? '').replace('$slug', params?.slug ?? '')}>{children}</a>
  ),
}))

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(), apiPostRequired: vi.fn(), apiDeleteRequired: vi.fn(), apiPatchRequired: vi.fn(), apiPutRequired: vi.fn(),
}))

const get = vi.mocked(api.apiGetRequired)

describe('LibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      page: 1, pageSize: 20, total: 3,
      items: [
        {
          availability: 'available', postId: 'post-1', type: 'post', savedAt: 100,
          item: {
            id: 'post-1', type: 'post', slug: 'saved-post', body: 'A saved post', createdAt: 90,
            author: { id: 'creator-1', displayName: 'Creator One', username: 'creatorone', avatarUrl: null },
            attachments: [], likeCount: 1, replyCount: 2, viewerLiked: false, viewerSaved: true, poll: null,
          },
        },
        {
          availability: 'membership_required', postId: 'article-1', type: 'article', savedAt: 80,
          creator: { id: 'creator-1', displayName: 'Creator One', username: 'creatorone', avatarUrl: null },
        },
        { availability: 'unavailable', postId: 'course-1', type: 'course', savedAt: 70 },
      ],
    })
  })

  it('renders mixed available, locked, and unavailable library entries', async () => {
    renderLibrary()
    expect(await screen.findByRole('heading', { name: 'Saved Library' })).toBeInTheDocument()
    expect(screen.getByText('A saved post')).toBeInTheDocument()
    expect(screen.getByText('Membership required')).toBeInTheDocument()
    expect(screen.getByText('Saved item unavailable')).toBeInTheDocument()
    expect(screen.getByLabelText('Search saved content')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Remove from library' })).toHaveLength(3)
  })

  it('renders the unfiltered empty state', async () => {
    get.mockResolvedValue({ page: 1, pageSize: 20, total: 0, items: [] })
    renderLibrary()
    expect(await screen.findByText('Your library is empty')).toBeInTheDocument()
  })
})

function renderLibrary() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><LibraryPage /></QueryClientProvider>)
}
