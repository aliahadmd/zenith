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
  adminRole: 'owner' | 'moderator' | null
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
  return apiPostRequired<{ success: true; email: string }>('/api/auth/register', values)
}

export function resendVerificationRequest(values: { email: string }) {
  return apiPostRequired<{ success: true }>('/api/auth/resend-verification', values)
}

export function forgotPasswordRequest(values: { email: string }) {
  return apiPostRequired<{ success: true }>('/api/auth/forgot-password', values)
}

export function resetPasswordRequest(values: { token: string; password: string; confirmPassword: string }) {
  return apiPostRequired<{ success: true }>('/api/auth/reset-password', values)
}

export function changePasswordRequest(values: { currentPassword: string; newPassword: string }) {
  return apiPostRequired<{ success: true }>('/api/auth/change-password', values)
}

export function logoutRequest() {
  return apiPostRequired<{ message: string }>('/api/auth/logout')
}

export function requestEmailChangeOtp(values: { newEmail: string }) {
  return apiPostRequired<{ success: true }>('/api/settings/email/otp/request', values)
}

export function verifyEmailChangeOtp(values: { newEmail: string; otp: string }) {
  return apiPostRequired<{ message: string; email: string }>('/api/settings/email/otp/verify', values)
}
