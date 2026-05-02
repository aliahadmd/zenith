import { createFileRoute, redirect } from '@tanstack/react-router'
import { authMeQueryOptions } from '../lib/auth'
import { RegisterPage } from '../pages/RegisterPage'

export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(authMeQueryOptions)
    if (!user) return

    throw redirect({
      to: '/feed',
      replace: true,
    })
  },
  component: RegisterPage,
})
