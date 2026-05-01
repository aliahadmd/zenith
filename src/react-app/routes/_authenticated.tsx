import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { authMeQueryOptions } from '../lib/auth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(authMeQueryOptions)

    if (!user) {
      throw redirect({
        to: '/login',
        replace: true,
      })
    }

    return { user }
  },
  component: AppShell,
})
