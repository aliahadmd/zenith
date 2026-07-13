import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StudioScheduledPage } from './StudioScheduledPage'
import * as api from '../lib/api'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: unknown }) => children }))
vi.mock('../components/StudioLayout', () => ({ StudioLayout: ({ title, children }: { title: string; children: ReactNode }) => <main><h1>{title}</h1>{children}</main> }))
vi.mock('../components/ShortPostComposer', () => ({ ShortPostComposer: () => null }))
vi.mock('../components/ScheduleDialog', () => ({ ScheduleDialog: () => null }))
vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(), apiPostRequired: vi.fn(), apiDeleteRequired: vi.fn(), apiPatchRequired: vi.fn(), apiPutRequired: vi.fn(),
}))

const get = vi.mocked(api.apiGetRequired)

describe('StudioScheduledPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    get.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [{
        postId: 'post-1', contentId: 'post-1', contentType: 'post', slug: 'scheduled-post', title: 'Scheduled post',
        status: 'pending', scheduledFor: Math.floor(Date.now() / 1000) + 3600, nextAttemptAt: Math.floor(Date.now() / 1000) + 3600,
        attemptCount: 0, revision: 1, processingStartedAt: null, publishedAt: null, failure: null, createdAt: 1, updatedAt: 1,
      }],
    })
  })

  it('renders upcoming schedules and management actions', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Scheduled' })).toBeInTheDocument()
    expect(await screen.findByText('Scheduled post')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reschedule' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel schedule for Scheduled post' })).toBeInTheDocument()
  })
})

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><StudioScheduledPage /></QueryClientProvider>)
}
