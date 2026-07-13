import { queryOptions } from '@tanstack/react-query'
import { apiDeleteRequired, apiGetRequired, apiPostRequired, apiPutRequired } from './api'

export type ScheduleStatus = 'pending' | 'processing' | 'published' | 'failed' | 'canceled'
export type ScheduleContentType = 'post' | 'article' | 'audio' | 'photography' | 'course'

export type ScheduleSummary = {
  postId: string
  contentId: string
  contentType: ScheduleContentType
  slug: string
  title: string
  status: ScheduleStatus
  scheduledFor: number
  nextAttemptAt: number
  attemptCount: number
  revision: number
  processingStartedAt: number | null
  publishedAt: number | null
  failure: { code: string; message: string } | null
  createdAt: number
  updatedAt: number
}

export type ScheduleListFilter = {
  page?: number
  pageSize?: number
  status?: 'upcoming' | 'failed' | 'history'
  type?: 'all' | ScheduleContentType
}

export const scheduleKeys = {
  all: ['schedules'] as const,
  list: (filter: ScheduleListFilter) => ['schedules', 'list', filter] as const,
  detail: (postId: string) => ['schedules', postId] as const,
}

export function schedulesQueryOptions(filter: ScheduleListFilter) {
  const params = new URLSearchParams({
    page: String(filter.page ?? 1),
    pageSize: String(filter.pageSize ?? 20),
    status: filter.status ?? 'upcoming',
    type: filter.type ?? 'all',
  })
  return queryOptions({
    queryKey: scheduleKeys.list(filter),
    queryFn: () => apiGetRequired<{ items: ScheduleSummary[]; page: number; pageSize: number; total: number }>(`/api/schedules?${params}`),
  })
}

export function scheduleDetailQueryOptions(postId: string) {
  return queryOptions({
    queryKey: scheduleKeys.detail(postId),
    queryFn: () => apiGetRequired<{ schedule: ScheduleSummary }>(`/api/schedules/${postId}`),
  })
}

export function saveSchedule(postId: string, scheduledFor: string) {
  return apiPutRequired<{ schedule: ScheduleSummary | null }>(`/api/schedules/${postId}`, { scheduledFor })
}

export function cancelSchedule(postId: string) {
  return apiDeleteRequired<{ canceled: true; schedule: ScheduleSummary | null }>(`/api/schedules/${postId}`)
}

export function retrySchedule(postId: string) {
  return apiPostRequired<{ schedule: ScheduleSummary | null }>(`/api/schedules/${postId}/retry`)
}

export function publishScheduledContent(postId: string) {
  return apiPostRequired<{ published: true; schedule: ScheduleSummary | null }>(`/api/schedules/${postId}/publish`)
}
