import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { PostCard } from './PostCard'
import * as postsLib from '../lib/posts'
import type { FeedPost } from '../lib/posts'

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

vi.mock('../lib/posts', async (importOriginal) => {
  const actual = await importOriginal<typeof postsLib>()
  return {
    ...actual,
    likePost: vi.fn(),
    unlikePost: vi.fn(),
    votePoll: vi.fn(),
  }
})

const mockLikePost = vi.mocked(postsLib.likePost)
const mockVotePoll = vi.mocked(postsLib.votePoll)

const post: FeedPost = {
  id: 'post-1',
  slug: 'hello-world',
  body: 'Hello subscribers',
  createdAt: 1_700_000_000,
  author: {
    id: 'creator-1',
    displayName: 'Creator One',
    username: 'creatorone',
    avatarUrl: '/api/profile/avatar/creator-1',
  },
  attachments: [
    {
      id: 'attachment-1',
      url: '/api/media/attachment-1',
      fileName: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
    },
  ],
  likeCount: 3,
  replyCount: 2,
  viewerLiked: false,
  viewerSaved: false,
  poll: {
    id: 'poll-1',
    question: 'Pick one',
    closesAt: null,
    viewerOptionId: null,
    totalVotes: 0,
    options: [
      { id: 'option-1', text: 'Yes', position: 0, voteCount: 0 },
      { id: 'option-2', text: 'No', position: 1, voteCount: 0 },
    ],
  },
}

describe('PostCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLikePost.mockResolvedValue({ likeCount: 4, viewerLiked: true })
    mockVotePoll.mockResolvedValue({ poll: post.poll ?? undefined })
  })

  it('renders private post interactions, media, poll, and detail link', () => {
    renderPostCard()

    expect(screen.getByRole('link', { name: 'Creator One' })).toHaveAttribute('href', '/u/creatorone/post/hello-world')
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toHaveAttribute('src', '/api/media/attachment-1')
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View replies for post by Creator One' })).toHaveAttribute('href', '/u/creatorone/post/hello-world')
  })

  it('likes posts and votes in polls', async () => {
    const user = userEvent.setup()
    renderPostCard()

    await user.click(screen.getByRole('button', { name: '3' }))
    await user.click(screen.getByRole('button', { name: 'Yes' }))

    await waitFor(() => {
      expect(mockLikePost).toHaveBeenCalledWith('post-1')
      expect(mockVotePoll).toHaveBeenCalledWith('poll-1', 'option-1')
    })
  })
})

function renderPostCard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <PostCard post={post} />
    </QueryClientProvider>,
  )
}
