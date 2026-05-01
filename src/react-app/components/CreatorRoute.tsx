import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'
import { LoadingBlock } from './LoadingBlock'

export function CreatorRoute({ children }: { children?: ReactNode }) {
  const { currentUser, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingBlock label="Checking creator access" className="min-h-screen" />
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  if (currentUser.role !== 'creator') {
    return <Navigate to="/become-creator" replace />
  }

  return <>{children}</>
}
