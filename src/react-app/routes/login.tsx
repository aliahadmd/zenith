import { createFileRoute, redirect } from '@tanstack/react-router'
import { authMeQueryOptions } from '../lib/auth'
import { LoginPage } from '../pages/LoginPage'

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): { verified?: string; reset?: string } => ({
    verified: typeof search.verified === 'string' ? search.verified : undefined,
    reset: typeof search.reset === 'string' ? search.reset : undefined,
  }),
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(authMeQueryOptions)
    if (!user) return

    throw redirect({
      to: '/feed',
      replace: true,
    })
  },
  component: LoginPage,
})
