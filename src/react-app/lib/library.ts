import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPostRequired } from './api'
import type { ArticleSummary } from './articles'
import type { AudioItemSummary } from './audio'
import type { CourseSummary } from './courses'
import type { PhotographyAlbumSummary } from './photography'
import type { FeedPost } from './posts'

export type LibraryContentType = 'all' | 'post' | 'article' | 'audio' | 'photography' | 'course'
export type LibrarySort = 'newest' | 'oldest'
export type LibraryAvailableContent = FeedPost | ArticleSummary | AudioItemSummary | PhotographyAlbumSummary | CourseSummary

export type LibraryItem =
  | {
      availability: 'available'
      postId: string
      type: Exclude<LibraryContentType, 'all'>
      savedAt: number | null
      item: LibraryAvailableContent
    }
  | {
      availability: 'membership_required'
      postId: string
      type: Exclude<LibraryContentType, 'all'>
      savedAt: number | null
      creator: { id: string; displayName: string; username: string; avatarUrl: string | null }
    }
  | {
      availability: 'unavailable'
      postId: string
      type: Exclude<LibraryContentType, 'all'>
      savedAt: number | null
    }

export type LibraryResponse = {
  items: LibraryItem[]
  page: number
  pageSize: number
  total: number
}

export const libraryKeys = {
  all: ['library'] as const,
  list: (input: { page: number; type: LibraryContentType; sort: LibrarySort; query: string }) =>
    ['library', input] as const,
}

export function libraryQueryOptions(input: { page: number; type: LibraryContentType; sort: LibrarySort; query: string }) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: '20',
    type: input.type,
    sort: input.sort,
  })
  if (input.query) params.set('query', input.query)
  return queryOptions({
    queryKey: libraryKeys.list(input),
    queryFn: () => apiGetRequired<LibraryResponse>(`/api/library?${params}`),
    placeholderData: keepPreviousData,
  })
}

export function saveToLibrary(postId: string) {
  return apiPostRequired<{ saved: true }>(`/api/library/${postId}`)
}

export function removeFromLibrary(postId: string) {
  return apiDeleteRequired<{ saved: false }>(`/api/library/${postId}`)
}
