import { queryOptions } from '@tanstack/react-query'
import { apiGetRequired, apiPatchRequired, apiPostRequired } from './api'
import type { PostReply } from './posts'

export type ArticleSummary = {
  id: string
  postId: string
  type: 'article'
  slug: string
  title: string
  excerpt: string
  markdown: string
  status: 'draft' | 'published'
  coverUrl: string | null
  createdAt: number | null
  publishedAt: number | null
  updatedAt: number | null
  author: {
    id: string
    displayName: string
    username: string
    avatarUrl: string | null
  }
  likeCount: number
  replyCount: number
  viewerLiked: boolean
  viewerSaved: boolean
}

export type ArticleDetailResponse = {
  article: ArticleSummary
  replies: PostReply[]
}

export type CreatorArticlesResponse = {
  articles: ArticleSummary[]
  hasAccess: boolean
}

export const articleKeys = {
  detail: (username: string, slug: string) => ['articles', username, slug] as const,
  byId: (postId: string) => ['articles', postId] as const,
  creator: (username: string) => ['profile', username, 'articles'] as const,
}

export function articleDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: articleKeys.detail(username, slug),
    queryFn: () => apiGetRequired<ArticleDetailResponse>(`/api/articles/by-slug/${username}/${slug}`),
  })
}

export function articleByIdQueryOptions(postId: string) {
  return queryOptions({
    queryKey: articleKeys.byId(postId),
    queryFn: () => apiGetRequired<ArticleDetailResponse>(`/api/articles/${postId}`),
  })
}

export function createArticle(values: FormData) {
  return apiPostRequired<{ article: ArticleSummary | null }>('/api/articles', values)
}

export function updateArticle(postId: string, values: FormData) {
  return apiPatchRequired<{ article: ArticleSummary | null }>(`/api/articles/${postId}`, values)
}

export function publishArticle(postId: string) {
  return apiPostRequired<{ article: ArticleSummary | null }>(`/api/articles/${postId}/publish`)
}
