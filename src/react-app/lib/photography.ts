import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPatchRequired, apiPostRequired, apiPutRequired } from './api'
import type { PostReply } from './posts'

export type PhotographyStatus = 'draft' | 'published'

export type PhotographyCreator = {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

export type PhotographyPhotoSummary = {
  id: string
  albumId: string
  title: string
  caption: string
  altText: string
  status: PhotographyStatus
  previewUrl: string
  displayUrl: string
  originalUrl: string | null
  originalContentType: string | null
  originalFileName: string | null
  originalSizeBytes: number | null
  originalDownloadEnabled: boolean
  width: number | null
  height: number | null
  displayOrder: number
  createdAt: number | null
  updatedAt: number | null
}

export type PhotographyAlbumSummary = {
  id: string
  postId: string
  type: 'photography'
  slug: string
  title: string
  description: string
  status: PhotographyStatus
  downloadsEnabled: boolean
  shootDate: number | null
  coverPhotoId: string | null
  coverUrl: string | null
  photoCount: number
  photos: PhotographyPhotoSummary[]
  publishedAt: number | null
  createdAt: number | null
  updatedAt: number | null
  author: PhotographyCreator
  likeCount: number
  replyCount: number
  viewerLiked: boolean
  viewerSaved: boolean
}

export type CreatorPhotographyResponse = {
  albums: PhotographyAlbumSummary[]
  photos: PhotographyPhotoSummary[]
  hasAccess: boolean
}

export type PhotographyAlbumsResponse = {
  albums: PhotographyAlbumSummary[]
}

export type PhotographyAlbumDetailResponse = {
  album: PhotographyAlbumSummary
  photos: PhotographyPhotoSummary[]
  replies: PostReply[]
}

export const photographyKeys = {
  mine: ['studio', 'photography', 'albums'] as const,
  profile: (username: string) => ['profile', username, 'photography'] as const,
  album: (username: string, slug: string) => ['photography', 'album', username, slug] as const,
}

export function minePhotographyAlbumsQueryOptions() {
  return queryOptions({
    queryKey: photographyKeys.mine,
    queryFn: () => apiGetRequired<PhotographyAlbumsResponse>('/api/photography/albums/mine'),
  })
}

export function creatorPhotographyQueryOptions(username: string, enabled: boolean) {
  return queryOptions({
    queryKey: photographyKeys.profile(username),
    queryFn: () => apiGetRequired<CreatorPhotographyResponse>(`/api/profile/${username}/photography`),
    enabled,
  })
}

export function photographyAlbumDetailQueryOptions(username: string, slug: string) {
  return queryOptions({
    queryKey: photographyKeys.album(username, slug),
    queryFn: () => apiGetRequired<PhotographyAlbumDetailResponse>(`/api/photography/albums/by-slug/${username}/${slug}`),
  })
}

export function createPhotographyAlbum(values: FormData) {
  return apiPostRequired<{ album: PhotographyAlbumSummary | null }>('/api/photography/albums', values)
}

export function updatePhotographyAlbum(albumId: string, values: FormData) {
  return apiPatchRequired<{ album: PhotographyAlbumSummary | null }>(`/api/photography/albums/${albumId}`, values)
}

export function deletePhotographyAlbum(albumId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/photography/albums/${albumId}`)
}

export function uploadPhotographyPhotos(albumId: string, values: FormData) {
  return apiPostRequired<{ photos: PhotographyPhotoSummary[] }>(`/api/photography/albums/${albumId}/photos`, values)
}

export function updatePhotographyPhoto(photoId: string, values: FormData) {
  return apiPatchRequired<{ photo: PhotographyPhotoSummary | null }>(`/api/photography/photos/${photoId}`, values)
}

export function deletePhotographyPhoto(photoId: string) {
  return apiDeleteRequired<{ ok: true }>(`/api/photography/photos/${photoId}`)
}

export function reorderPhotographyPhotos(albumId: string, photoIds: string[]) {
  return apiPutRequired<{ ok: true }>(`/api/photography/albums/${albumId}/order`, { photoIds })
}
