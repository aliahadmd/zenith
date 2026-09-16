import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordPage } from '../pages/ResetPasswordPage'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPasswordPage,
})
