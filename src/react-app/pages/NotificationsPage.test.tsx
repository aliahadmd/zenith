import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsPage } from './NotificationsPage'

const mutateMock = vi.fn()
let queryState: 'loaded' | 'empty' = 'loaded'

vi.mock('@tanstack/react-query', () => ({
  queryOptions: vi.fn((options) => options),
  useQuery: vi.fn(() => {
    if (queryState === 'empty') {
      return { isPending: false, isError: false, data: { notifications: [], nextOffset: null } }
    }

    return {
      isPending: false,
      isError: false,
      data: {
        notifications: [
          {
            id: 'notification-1',
            type: 'content_published',
            category: 'content',
            title: 'New post from Creator',
            body: 'Creator published a new post.',
            targetUrl: '/u/creator/post/new-post',
            entityType: 'post',
            entityId: 'post-1',
            metadata: null,
            readAt: null,
            unread: true,
            emailStatus: 'not_applicable',
            emailError: null,
            emailSentAt: null,
            createdAt: 1_700_000_000,
            actor: {
              id: 'creator-1',
              displayName: 'Creator',
              username: 'creator',
              avatarUrl: null,
            },
          },
        ],
        nextOffset: null,
      },
    }
  }),
  useMutation: vi.fn(() => ({ mutate: mutateMock, isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}))

describe('NotificationsPage', () => {
  beforeEach(() => {
    queryState = 'loaded'
    mutateMock.mockClear()
  })

  it('renders notification rows with mark-read actions', () => {
    render(<NotificationsPage />)

    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeInTheDocument()
    expect(screen.getByText('New post from Creator')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/u/creator/post/new-post')
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeInTheDocument()
  })

  it('calls mark-all mutation from the toolbar', async () => {
    const user = userEvent.setup()
    render(<NotificationsPage />)

    await user.click(screen.getByRole('button', { name: /Mark all read/i }))

    expect(mutateMock).toHaveBeenCalled()
  })

  it('renders the empty state', () => {
    queryState = 'empty'
    render(<NotificationsPage />)

    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})
