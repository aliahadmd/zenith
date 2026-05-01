import type { ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'
import { LoadingBlock } from './LoadingBlock'

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { currentUser, isLoading } = useAuth()

  if (isLoading) {
    return <LoadingBlock label="Checking session" className="min-h-screen" />
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
