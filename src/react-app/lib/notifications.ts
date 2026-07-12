import { queryOptions } from '@tanstack/react-query'
import { apiGetRequired, apiPatchRequired, apiPostRequired, apiPutRequired } from './api'

export type NotificationCategory = 'content' | 'interaction' | 'subscription' | 'account'

export type NotificationItem = {
  id: string
  type: string
  category: NotificationCategory
  title: string
  body: string
  targetUrl: string | null
  entityType: string | null
  entityId: string | null
  metadata: Record<string, unknown> | null
  readAt: number | null
  unread: boolean
  emailStatus: 'not_applicable' | 'pending' | 'sent' | 'failed'
  emailError: string | null
  emailSentAt: number | null
  createdAt: number | null
  actor: {
    id: string
    displayName: string | null
    username: string | null
    avatarUrl: string | null
  } | null
}

export type NotificationPreferences = {
  emailEnabled: boolean
  contentEmailEnabled: boolean
  interactionEmailEnabled: boolean
  subscriptionEmailEnabled: boolean
}

export type NotificationsResponse = {
  notifications: NotificationItem[]
  nextOffset: number | null
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (filter: 'all' | 'unread') => ['notifications', 'list', filter] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
  preferences: ['notifications', 'preferences'] as const,
}

export function notificationsQueryOptions(filter: 'all' | 'unread') {
  return queryOptions({
    queryKey: notificationKeys.list(filter),
    queryFn: () => apiGetRequired<NotificationsResponse>(`/api/notifications?filter=${filter}`),
    staleTime: 20_000,
  })
}

export const unreadNotificationCountQueryOptions = queryOptions({
  queryKey: notificationKeys.unreadCount,
  queryFn: () => apiGetRequired<{ count: number }>('/api/notifications/unread-count'),
  staleTime: 20_000,
})

export const notificationPreferencesQueryOptions = queryOptions({
  queryKey: notificationKeys.preferences,
  queryFn: () => apiGetRequired<{ preferences: NotificationPreferences }>('/api/notifications/preferences'),
})

export function markNotificationRead(notificationId: string) {
  return apiPatchRequired<{ ok: true }>(`/api/notifications/${notificationId}/read`)
}

export function markAllNotificationsRead() {
  return apiPostRequired<{ ok: true }>('/api/notifications/read-all')
}

export function updateNotificationPreferences(values: NotificationPreferences) {
  return apiPutRequired<{ preferences: NotificationPreferences }>('/api/notifications/preferences', values)
}
