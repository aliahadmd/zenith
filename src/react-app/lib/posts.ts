import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPatchRequired, apiPostRequired } from './api'
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
  publishedAt?: number | null
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
  viewerSaved: boolean
  poll: Poll | null
}

export type PostReply = {
  id: string
  postId: string
  parentReplyId: string | null
  body: string
  createdAt: number | null
  editedAt: number | null
  deletedAt: number | null
  isDeleted: boolean
  viewerCanManage: boolean
  author: {
    id: string
    displayName: string
    username: string
    avatarUrl: string | null
  } | null
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
  draft: (postId: string) => ['posts', postId, 'draft'] as const,
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

export function createPost(values: FormData | { body: string; scheduledFor?: string }) {
  return apiPostRequired('/api/posts', values)
}

export function draftPostQueryOptions(postId: string) {
  return queryOptions({
    queryKey: postKeys.draft(postId),
    queryFn: () => apiGetRequired<{ post: FeedPost }>(`/api/posts/drafts/${postId}`),
  })
}

export function updateDraftPost(postId: string, values: FormData | { body: string }) {
  return apiPatchRequired<{ post: FeedPost | null }>(`/api/posts/${postId}`, values)
}

export function deleteDraftPost(postId: string) {
  return apiDeleteRequired<{ deleted: true }>(`/api/posts/${postId}`)
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

export function updateReply(replyId: string, body: string) {
  return apiPatchRequired<{ reply: PostReply | undefined }>(`/api/replies/${replyId}`, { body })
}

export function deleteReply(replyId: string) {
  return apiDeleteRequired<{ deleted: true }>(`/api/replies/${replyId}`)
}

export function votePoll(pollId: string, optionId: string) {
  return apiPostRequired<{ poll: Poll | undefined }>(`/api/polls/${pollId}/vote`, { optionId })
}
