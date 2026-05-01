import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'

export function CreatorRoute({ children }: { children?: ReactNode }) {
  const { currentUser, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (currentUser.role !== 'creator') {
    return <Navigate to="/become-creator" replace />
  }

  return <>{children}</>
}
