import { createFileRoute, redirect } from '@tanstack/react-router'
import { authMeQueryOptions } from '../lib/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(authMeQueryOptions)

    throw redirect({
      to: user ? '/feed' : '/login',
      replace: true,
    })
  },
})
