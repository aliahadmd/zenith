import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { PostDetailPage } from './PostDetailPage'
import * as api from '../lib/api'
import type { FeedPost, PostDetailResponse, PostReply } from '../lib/posts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    className,
    children,
    ...props
  }: {
    to: string
    params?: { username?: string; slug?: string }
    className?: string
    children: ReactNode
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const href = to
      .replace('$username', params?.username ?? '')
      .replace('$slug', params?.slug ?? '')
    return <a href={href} className={className} {...props}>{children}</a>
  },
}))

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
  apiPostRequired: vi.fn(),
  apiDeleteRequired: vi.fn(),
}))

const mockApiGetRequired = vi.mocked(api.apiGetRequired)
const mockApiPostRequired = vi.mocked(api.apiPostRequired)

const post: FeedPost = {
  id: 'post-1',
  slug: 'member-update',
  body: 'A private member update',
  createdAt: 1_700_000_000,
  author: {
    id: 'creator-1',
    displayName: 'Creator One',
    username: 'creatorone',
    avatarUrl: '/api/profile/avatar/creator-1',
  },
  attachments: [],
  likeCount: 3,
  replyCount: 2,
  viewerLiked: false,
  poll: null,
}

const replies: PostReply[] = [
  {
    id: 'reply-1',
    postId: 'post-1',
    parentReplyId: null,
    body: 'Root reply',
    createdAt: 1_700_000_100,
    author: {
      id: 'member-1',
      displayName: 'Member One',
      username: 'memberone',
      avatarUrl: null,
    },
    mentionedUser: {
      id: 'creator-1',
      displayName: 'Creator One',
      username: 'creatorone',
    },
    attachments: [
      {
        id: 'reply-attachment-1',
        url: '/api/media/reply-attachment-1',
        fileName: 'reply-photo.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      },
    ],
    likeCount: 4,
    viewerLiked: false,
  },
  {
    id: 'reply-2',
    postId: 'post-1',
    parentReplyId: 'reply-1',
    body: 'Nested reply',
    createdAt: 1_700_000_200,
    author: {
      id: 'member-2',
      displayName: 'Nested Member',
      username: 'nestedmember',
      avatarUrl: null,
    },
    mentionedUser: {
      id: 'member-1',
      displayName: 'Member One',
      username: 'memberone',
    },
    attachments: [],
    likeCount: 1,
    viewerLiked: false,
  },
]

describe('PostDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGetRequired.mockResolvedValue(makeDetailResponse())
    mockApiPostRequired.mockResolvedValue({ likeCount: 5, viewerLiked: true })
  })

  it('renders the post detail stream, inline composer, replies, and media', async () => {
    renderPostDetailPage()

    expect(await screen.findByRole('heading', { name: 'Post' })).toBeInTheDocument()
    expect(screen.getByText('2 replies')).toBeInTheDocument()
    expect(screen.getByText('A private member update')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reply to @creatorone')).toBeInTheDocument()
    expect(screen.getByText('Root reply')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'reply-photo.jpg' })).toHaveAttribute('src', '/api/media/reply-attachment-1')
  })

  it('keeps nested replies shallow and opens an inline composer for the selected reply', async () => {
    const user = userEvent.setup()
    renderPostDetailPage()

    const nestedReply = await screen.findByText('Nested reply')
    expect(nestedReply.closest('[data-thread-depth]')).toHaveAttribute('data-thread-depth', '1')

    await user.click(screen.getByRole('button', { name: 'Reply to Member One' }))

    expect(screen.getByPlaceholderText('Reply to @memberone')).toBeInTheDocument()
  })

  it('submits replies and likes reply rows through the existing post API helpers', async () => {
    const user = userEvent.setup()
    renderPostDetailPage()

    await user.type(await screen.findByPlaceholderText('Reply to @creatorone'), 'Thanks for the update')
    await user.click(screen.getByRole('button', { name: 'Reply' }))

    await waitFor(() => {
      expect(mockApiPostRequired).toHaveBeenCalledWith('/api/posts/post-1/replies', {
        body: 'Thanks for the update',
      })
    })

    await user.click(screen.getByRole('button', { name: 'Like reply from Member One' }))

    await waitFor(() => {
      expect(mockApiPostRequired).toHaveBeenCalledWith('/api/replies/reply-1/like')
    })
  })

  it('renders the empty replies state inside the stream', async () => {
    mockApiGetRequired.mockResolvedValue(makeDetailResponse([]))

    renderPostDetailPage()

    expect(await screen.findByText('No replies yet')).toBeInTheDocument()
    expect(screen.getByText('Start the conversation with @creatorone.')).toBeInTheDocument()
  })
})

function makeDetailResponse(nextReplies = replies): PostDetailResponse {
  return {
    post,
    replies: nextReplies,
  }
}

function renderPostDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PostDetailPage username="creatorone" slug="member-update" />
    </QueryClientProvider>,
  )
}
