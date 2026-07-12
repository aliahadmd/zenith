import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPatchRequired, apiPostRequired, apiPutRequired } from './api'
import type { PostReply } from './posts'

export type AudioCollectionKind = 'album' | 'podcast'
export type AudioItemKind = 'music' | 'podcast_episode'
export type AudioStatus = 'draft' | 'published'

export type AudioCreator = {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

export type AudioCollectionSummary = {
  id: string
  type: 'audio_collection'
  kind: AudioCollectionKind
  slug: string
  title: string
  description: string
  status: AudioStatus
  coverUrl: string | null
  releaseDate: number | null
  createdAt: number | null
  updatedAt: number | null
  itemCount: number
  creator: AudioCreator
}

export type AudioItemSummary = {
  id: string
  postId: string
  type: 'audio'
  kind: AudioItemKind
  slug: string
  title: string
  description: string
  status: AudioStatus
  streamUrl: string | null
  coverUrl: string | null
  durationSeconds: number | null
  displayOrder: number
  createdAt: number | null
  publishedAt: number | null
  updatedAt: number | null
  collection: {
    id: string
    kind: AudioCollectionKind
    slug: string
    title: string
    coverUrl: string | null
  }
  author: AudioCreator
  likeCount: number
  replyCount: number
  viewerLiked: boolean
  viewerSaved: boolean
}

export type CreatorAudioResponse = {
  items: AudioItemSummary[]
  albums: AudioCollectionSummary[]
  episodes: AudioItemSummary[]
  podcasts: AudioCollectionSummary[]
  hasAccess: boolean
}

export type AudioCollectionsResponse = {
  collections: AudioCollectionSummary[]
}

export type AudioCollectionDetailResponse = {
  collection: AudioCollectionSummary
  items: AudioItemSummary[]
}

export type AudioItemDetailResponse = {
  item: AudioItemSummary
  replies: PostReply[]
}

export const audioKeys = {
  mine: (kind?: AudioCollectionKind) => ['studio', 'audio', 'collections', kind ?? 'all'] as const,
  profile: (username: string) => ['profile', username, 'audio'] as const,
  collection: (username: string, slug: string) => ['audio', 'collection', username, slug] as const,
  item: (username: string, slug: string) => ['audio', 'item', username, slug] as const,
}

export function mineAudioCollectionsQueryOptions(kind?: AudioCollectionKind) {
  const params = kind ? `?kind=${kind}` : ''
  return queryOptions({
    queryKey: audioKeys.mine(kind),
    queryFn: () => apiGetRequired<AudioCollectionsResponse>(`/api/audio/collections/mine${params}`),
  })
}

export function creatorAudioQueryOptions(username: string, enabled: boolean) {
  return queryOptions({
    queryKey: audioKeys.profile(username),
    queryFn: () => apiGetRequired<CreatorAudioResponse>(`/api/profile/${username}/audio`),
    enabled,
  })
}

export function audioCollectionDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: audioKeys.collection(username, slug),
    queryFn: () => apiGetRequired<AudioCollectionDetailResponse>(`/api/audio/collections/by-slug/${username}/${slug}`),
  })
}

export function audioItemDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: audioKeys.item(username, slug),
    queryFn: () => apiGetRequired<AudioItemDetailResponse>(`/api/audio/items/by-slug/${username}/${slug}`),
  })
}

export function createAudioCollection(values: FormData) {
  return apiPostRequired<{ collection: AudioCollectionSummary | null }>('/api/audio/collections', values)
}

export function updateAudioCollection(collectionId: string, values: FormData) {
  return apiPatchRequired<{ collection: AudioCollectionSummary | null }>(`/api/audio/collections/${collectionId}`, values)
}

export function deleteAudioCollection(collectionId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/audio/collections/${collectionId}`)
}

export function createAudioItem(values: FormData) {
  return apiPostRequired<{ item: AudioItemSummary | null }>('/api/audio/items', values)
}

export function updateAudioItem(itemId: string, values: FormData) {
  return apiPatchRequired<{ item: AudioItemSummary | null }>(`/api/audio/items/${itemId}`, values)
}

export function deleteAudioItem(itemId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/audio/items/${itemId}`)
}

export function reorderAudioItems(collectionId: string, itemIds: string[]) {
  return apiPutRequired<{ ok: true }>(`/api/audio/collections/${collectionId}/order`, { itemIds })
}

export function formatAudioDuration(seconds: number | null | undefined) {
  if (!seconds) return '--:--'
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}
