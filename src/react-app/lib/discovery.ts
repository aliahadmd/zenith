import { queryOptions } from '@tanstack/react-query'
import { apiGetRequired, apiPutRequired } from './api'

export type DiscoverySort = 'relevance' | 'recommended' | 'popular' | 'recent'

export type DiscoveryCategory = {
  id: string
  slug: string
  name: string
  description: string | null
  displayOrder: number
  creatorCount: number
}

export type CreatorDiscoveryCardData = {
  id: string
  displayName: string
  username: string
  tagline: string | null
  avatarUrl: string | null
  categories: Array<{ id: string; slug: string; name: string }>
  publishedContentCount: number
  contentTypes: Array<'post' | 'article' | 'audio' | 'photography' | 'course'>
  featured: boolean
  viewerSubscribed: boolean
  recommendationReason: string | null
}

export type DiscoveryOverview = {
  categories: DiscoveryCategory[]
  featured: CreatorDiscoveryCardData[]
  recommended: CreatorDiscoveryCardData[]
  interests: Array<{ id: string; slug: string; name: string }>
  needsInterests: boolean
}

export type DiscoveryPreferences = {
  categories: DiscoveryCategory[]
  interestCategoryIds: string[]
  creatorCategoryIds: string[]
}

export type CreatorSearchInput = {
  q: string
  category: string
  sort: DiscoverySort
  page: number
  pageSize?: number
}

export type CreatorSearchResponse = {
  creators: CreatorDiscoveryCardData[]
  total: number
  page: number
  pageSize: number
}

export const discoveryKeys = {
  all: ['discovery'] as const,
  overview: ['discovery', 'overview'] as const,
  preferences: ['discovery', 'preferences'] as const,
  creators: (input: CreatorSearchInput) => ['discovery', 'creators', input] as const,
}

export const discoveryOverviewQueryOptions = queryOptions({
  queryKey: discoveryKeys.overview,
  queryFn: () => apiGetRequired<DiscoveryOverview>('/api/discovery'),
  staleTime: 60_000,
})

export const discoveryPreferencesQueryOptions = queryOptions({
  queryKey: discoveryKeys.preferences,
  queryFn: () => apiGetRequired<DiscoveryPreferences>('/api/discovery/preferences'),
  staleTime: 60_000,
})

export function creatorSearchQueryOptions(input: CreatorSearchInput, enabled = true) {
  const params = new URLSearchParams({
    q: input.q,
    category: input.category,
    sort: input.sort,
    page: String(input.page),
    pageSize: String(input.pageSize ?? 20),
  })
  return queryOptions({
    queryKey: discoveryKeys.creators(input),
    queryFn: () => apiGetRequired<CreatorSearchResponse>(`/api/discovery/creators?${params}`),
    enabled,
  })
}

export function updateDiscoveryInterests(categoryIds: string[]) {
  return apiPutRequired<{ categoryIds: string[] }>('/api/discovery/interests', { categoryIds })
}

export function updateCreatorCategories(categoryIds: string[]) {
  return apiPutRequired<{ categoryIds: string[] }>('/api/discovery/creator-categories', { categoryIds })
}
