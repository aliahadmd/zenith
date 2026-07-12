import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/admin')({
  beforeLoad: ({ context }) => {
    if (!context.user.adminRole) throw redirect({ to: '/feed', replace: true })
  },
  component: Outlet,
})
