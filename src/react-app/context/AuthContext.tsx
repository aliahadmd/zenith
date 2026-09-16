import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  authKeys,
  authMeQueryOptions,
  loginRequest,
  logoutRequest,
  type User,
} from '../lib/auth'
import { ApiError } from '../lib/api'

export type { User } from '../lib/auth'

type AuthContextValue = {
  currentUser: User | null
  isLoading: boolean
  completePasswordSignIn: (email: string, password: string) => Promise<{ error: string | null; code: string | null; user: User | null }>
  logout: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const currentUserQuery = useQuery(authMeQueryOptions)
  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginRequest({ email, password }),
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

  async function completePasswordSignIn(email: string, password: string) {
    try {
      const user = await loginMutation.mutateAsync({ email, password })
      return { error: null, code: null, user }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Could not sign in',
        code: error instanceof ApiError ? error.code ?? null : null,
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
    <AuthContext.Provider value={{ currentUser, isLoading, completePasswordSignIn, logout, refreshCurrentUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
