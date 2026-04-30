import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { apiGet, apiPost } from '../lib/api'

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

type AuthContextValue = {
  currentUser: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ error: string | null }>
  logout: () => Promise<void>
  refreshCurrentUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // On mount, check if user is already logged in
    apiGet<User>('/api/auth/me').then(({ data }) => {
      setCurrentUser(data)
      setIsLoading(false)
    })

    // Listen for unauthorized events from the API client
    const handleUnauthorized = () => setCurrentUser(null)
    window.addEventListener('unauthorized', handleUnauthorized)
    return () => window.removeEventListener('unauthorized', handleUnauthorized)
  }, [])

  async function login(email: string, password: string) {
    const { data, error } = await apiPost<User>('/api/auth/login', { email, password })
    if (data) setCurrentUser(data)
    return { error }
  }

  async function logout() {
    await apiPost('/api/auth/logout')
    setCurrentUser(null)
  }

  async function refreshCurrentUser() {
    const { data } = await apiGet<User>('/api/auth/me')
    if (data) setCurrentUser(data)
  }

  return (
    <AuthContext.Provider value={{ currentUser, isLoading, login, logout, refreshCurrentUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
