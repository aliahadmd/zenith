import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiGet, apiPostRequired } from './api'

export type User = {
  id: string
  email: string
  role: 'subscriber' | 'creator'
  displayName: string
  username: string
  tagline?: string | null
  avatarUrl?: string | null
  socialLinks?: string | null
}

export const authKeys = {
  me: ['auth', 'me'] as const,
}

export async function fetchCurrentUser(): Promise<User | null> {
  const { data, error, status, code, details } = await apiGet<User>('/api/auth/me')

  if (status === 401) return null
  if (error) throw new ApiError(error, status, code, details)

  return data
}

export const authMeQueryOptions = queryOptions({
  queryKey: authKeys.me,
  queryFn: fetchCurrentUser,
  retry: false,
  staleTime: 30_000,
})

export function loginRequest(values: { email: string; password: string }) {
  return apiPostRequired<User>('/api/auth/login', values)
}

export function registerRequest(values: { email: string; password: string }) {
  return apiPostRequired<User>('/api/auth/register', values)
}

export function logoutRequest() {
  return apiPostRequired<{ message: string }>('/api/auth/logout')
}
