import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPostRequired } from './api'
import type { ArticleSummary } from './articles'
import type { AudioItemSummary } from './audio'
import type { PhotographyAlbumSummary } from './photography'
import type { CourseSummary } from './courses'

export type Attachment = {
  id: string
  url: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export type Poll = {
  id: string
  question: string
  closesAt: number | null
  viewerOptionId: string | null
  totalVotes: number
  options: Array<{
    id: string
    text: string
    position: number
    voteCount: number
  }>
}

export type FeedPost = {
  id: string
  type?: 'post'
  slug: string
  body: string
  createdAt: number | null
  author: {
    id: string
    displayName: string
    username: string
    avatarUrl: string | null
  }
  attachments: Attachment[]
  likeCount: number
  replyCount: number
  viewerLiked: boolean
  poll: Poll | null
}

export type PostReply = {
  id: string
  postId: string
  parentReplyId: string | null
  body: string
  createdAt: number | null
  author: {
    id: string
    displayName: string
    username: string
    avatarUrl: string | null
  }
  mentionedUser: {
    id: string
    displayName: string | null
    username: string | null
  } | null
  attachments: Attachment[]
  likeCount: number
  viewerLiked: boolean
}

export type PostDetailResponse = {
  post: FeedPost
  replies: PostReply[]
}

export type FeedResponse = {
  posts: FeedPost[]
  items?: Array<FeedPost | ArticleSummary | AudioItemSummary | PhotographyAlbumSummary | CourseSummary>
  message?: string
}

export const postKeys = {
  feed: ['feed'] as const,
  creator: (username: string) => ['profile', username, 'posts'] as const,
  detail: (username: string, slug: string) => ['posts', username, slug] as const,
  replies: (postId: string) => ['posts', postId, 'replies'] as const,
}

export function feedQueryOptions() {
  return queryOptions({
    queryKey: postKeys.feed,
    queryFn: () => apiGetRequired<FeedResponse>('/api/feed'),
  })
}

export function postDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: postKeys.detail(username, slug),
    queryFn: () => apiGetRequired<PostDetailResponse>(`/api/posts/by-slug/${username}/${slug}`),
  })
}

export function createPost(values: FormData | { body: string }) {
  return apiPostRequired('/api/posts', values)
}

export function createReply(postId: string, values: FormData | { body: string; parentReplyId?: string }) {
  return apiPostRequired<{ reply: PostReply | undefined }>(`/api/posts/${postId}/replies`, values)
}

export function likePost(postId: string) {
  return apiPostRequired<{ likeCount: number; viewerLiked: boolean }>(`/api/posts/${postId}/like`)
}

export function unlikePost(postId: string) {
  return apiDeleteRequired<{ likeCount: number; viewerLiked: boolean }>(`/api/posts/${postId}/like`)
}

export function likeReply(replyId: string) {
  return apiPostRequired<{ likeCount: number; viewerLiked: boolean }>(`/api/replies/${replyId}/like`)
}

export function unlikeReply(replyId: string) {
  return apiDeleteRequired<{ likeCount: number; viewerLiked: boolean }>(`/api/replies/${replyId}/like`)
}

export function votePoll(pollId: string, optionId: string) {
  return apiPostRequired<{ poll: Poll | undefined }>(`/api/polls/${pollId}/vote`, { optionId })
}
