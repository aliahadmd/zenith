import { apiDeleteRequired, apiGetRequired, apiPostRequired } from './api'

export type AdminRole = 'owner' | 'moderator'
export type PageResponse<T> = { items: T[]; page: number; pageSize: number; total: number }

export type AdminApplication = {
  id: string
  userId: string
  fullName: string
  email: string
  username: string
  city: string
  country: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: number
  updatedAt: number
}

export type ModerationCase = {
  id: string
  target_type: 'post' | 'reply' | 'user'
  target_id: string
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed'
  assigned_admin_id: string | null
  reportCount: number
  updated_at: number
  resolution_action: string | null
}

export type ManagedUser = {
  id: string
  email: string
  username: string
  displayName: string
  role: 'subscriber' | 'creator'
  accountStatus: 'active' | 'suspended'
  adminRole: AdminRole | null
  createdAt: number
}

export function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return params.toString()
}

export function getAdminPage<T>(path: string, values: Record<string, string | number | undefined>) {
  return apiGetRequired<PageResponse<T>>(`${path}?${queryString(values)}`)
}

export function adminDecision(path: string, reason: string, note?: string) {
  return apiPostRequired(path, { reason, note })
}

export function reportContent(input: {
  targetType: 'post' | 'reply' | 'user'
  targetId: string
  reason: string
  details?: string
}) {
  return apiPostRequired<{ caseId: string; reported: true }>('/api/reports', input)
}

export function revokeAdministrator(userId: string, reason: string) {
  return apiDeleteRequired<{ revoked: true }>(`/api/admin/administrators/${userId}`, { reason })
}
