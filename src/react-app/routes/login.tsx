import { createFileRoute, redirect } from '@tanstack/react-router'
import { authMeQueryOptions } from '../lib/auth'
import { LoginPage } from '../pages/LoginPage'

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(authMeQueryOptions)
    if (!user) return

    throw redirect({
      to: user.role === 'creator' ? '/studio' : '/feed',
      replace: true,
    })
  },
  component: LoginPage,
})
