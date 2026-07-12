import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  authKeys,
  authMeQueryOptions,
  logoutRequest,
  verifyOtp,
  type User,
} from '../lib/auth'

export type { User } from '../lib/auth'

type AuthContextValue = {
  currentUser: User | null
  isLoading: boolean
  completeOtpSignIn: (email: string, otp: string) => Promise<{ error: string | null; user: User | null }>
  logout: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const currentUserQuery = useQuery(authMeQueryOptions)
  const otpMutation = useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) => verifyOtp({ email, otp }),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user)
    },
  })
  const logoutMutation = useMutation({
    mutationFn: logoutRequest,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.me, null)
      queryClient.removeQueries({ queryKey: ['feed'] })
      queryClient.removeQueries({ queryKey: ['profile'] })
    },
  })

  useEffect(() => {
    const handleUnauthorized = () => queryClient.setQueryData(authKeys.me, null)
    window.addEventListener('unauthorized', handleUnauthorized)
    window.addEventListener('account-suspended', handleUnauthorized)
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized)
      window.removeEventListener('account-suspended', handleUnauthorized)
    }
  }, [queryClient])

  async function completeOtpSignIn(email: string, otp: string) {
    try {
      const user = await otpMutation.mutateAsync({ email, otp })
      return { error: null, user }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Invalid or expired code',
        user: null,
      }
    }
  }

  async function logout() {
    try {
      await logoutMutation.mutateAsync()
    } finally {
      queryClient.setQueryData(authKeys.me, null)
    }
  }

  async function refreshCurrentUser() {
    await queryClient.invalidateQueries({ queryKey: authKeys.me })
  }

  const currentUser = currentUserQuery.data ?? null
  const isLoading = currentUserQuery.isPending

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, completeOtpSignIn, logout, refreshCurrentUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
