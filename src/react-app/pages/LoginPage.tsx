import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { resendVerificationRequest } from '../lib/auth'
import { authLoginSchema } from '../lib/schemas'

type LoginValues = {
  email: string
  password: string
}

export function LoginPage() {
  const { completePasswordSignIn } = useAuth()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { verified?: string; reset?: string }
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const form = useForm<LoginValues>({
    resolver: zodResolver(authLoginSchema),
    defaultValues: { email: '', password: '' },
  })
  const resendMutation = useMutation({ mutationFn: resendVerificationRequest })

  async function handleSubmit(values: LoginValues) {
    setUnverifiedEmail(null)
    setResent(false)
    const { error, code } = await completePasswordSignIn(values.email, values.password)
    if (error) {
      if (code === 'email_not_verified') {
        setUnverifiedEmail(values.email)
        return
      }
      form.setValue('password', '')
      form.setError('root', { message: error })
      return
    }
    await navigate({ to: '/feed' })
  }

  return (
    <AuthPageShell
      mode="login"
      title="Sign in"
      description="Enter your email and password to continue."
      footer={
        <AuthFooter>
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Register
          </Link>
        </AuthFooter>
      }
    >
      {search.verified ? (
        <p className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Email verified. Sign in to continue.
        </p>
      ) : null}
      {search.reset ? (
        <p className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      {unverifiedEmail ? (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <p>
            Verify {unverifiedEmail} before signing in. We sent a fresh verification link to your inbox.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-auto px-0 tracking-normal normal-case"
            disabled={resendMutation.isPending}
            onClick={() => {
              resendMutation.mutate({ email: unverifiedEmail }, {
                onSuccess: () => setResent(true),
              })
            }}
          >
            {resendMutation.isPending ? 'Resending...' : 'Resend verification email'}
          </Button>
          {resent ? <p className="mt-1 text-xs">Verification email sent. Check your inbox.</p> : null}
        </div>
      ) : null}
      <Form {...form}>
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <FormControl>
                  <Input type="password" placeholder="Your password" autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RootError message={form.formState.errors.root?.message} />
          <Button type="submit" className="w-full tracking-normal normal-case" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
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
