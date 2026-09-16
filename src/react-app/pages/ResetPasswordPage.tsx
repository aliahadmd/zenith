import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { resetPasswordRequest } from '../lib/auth'
import { ApiError } from '../lib/api'
import { resetPasswordSchema } from '../lib/schemas'

type ResetValues = {
  password: string
  confirmPassword: string
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { token?: string; error?: string }
  const token = search.token ?? ''
  const invalidLink = search.error === 'INVALID_TOKEN'
  const form = useForm<ResetValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })
  const resetMutation = useMutation({ mutationFn: resetPasswordRequest })

  async function handleSubmit(values: ResetValues) {
    try {
      await resetMutation.mutateAsync({ token, password: values.password, confirmPassword: values.confirmPassword })
      await navigate({ to: '/login', search: { reset: '1' }, replace: true })
    } catch (error) {
      const message = error instanceof ApiError && error.code === 'invalid_reset_token'
        ? 'This reset link is invalid or has expired. Request a new one.'
        : error instanceof Error
          ? error.message
          : 'Could not reset the password.'
      form.setError('root', { message })
    }
  }

  if (!token || invalidLink) {
    return (
      <AuthPageShell
        mode="login"
        title={invalidLink ? 'Reset link expired' : 'Reset link missing'}
        description={invalidLink
          ? 'This reset link is invalid or has expired. Request a fresh one.'
          : 'Open the reset link from your email, or request a fresh one.'}
        footer={
          <AuthFooter>
            <Link to="/forgot-password" className="font-medium text-primary underline-offset-4 hover:underline">
              Request a new reset link
            </Link>
          </AuthFooter>
        }
      >
        <p className="text-sm text-muted-foreground">
          Reset links expire after 1 hour and can only be used once.
        </p>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell
      mode="login"
      title="Choose a new password"
      description="Pick a new password for your Zenith account."
      footer={
        <AuthFooter>
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </AuthFooter>
      }
    >
      <Form {...form}>
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="At least 8 characters" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Repeat your new password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RootError message={form.formState.errors.root?.message} />
          <Button type="submit" className="w-full tracking-normal normal-case" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Updating password...' : 'Update password'}
          </Button>
        </form>
      </Form>
    </AuthPageShell>
  )
}

function RootError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}
