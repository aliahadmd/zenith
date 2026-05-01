import { Navigate, Outlet } from 'react-router'
import { useAuth } from '../context/AuthContext'

export function CreatorRoute() {
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

  return <Outlet />
}
