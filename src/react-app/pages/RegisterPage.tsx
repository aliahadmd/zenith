import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { authKeys, registerRequest } from '../lib/auth'
import { ApiError } from '../lib/api'
import { registerSchema } from '../lib/schemas'

type RegisterFormValues = z.infer<typeof registerSchema>

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })
  const registerMutation = useMutation({
    mutationFn: registerRequest,
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.me, user)
    },
  })

  async function handleSubmit(values: RegisterFormValues) {
    try {
      await registerMutation.mutateAsync(values)
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 409
          ? 'An account with this email already exists.'
          : error instanceof Error
            ? error.message
            : 'Registration failed. Please try again.'
      form.setError('root', { message })
      return
    }

    const { user: loggedInUser, error } = await login(values.email, values.password)
    if (error) {
      form.setError('root', { message: error })
      return
    }
    await navigate({ to: loggedInUser ? '/feed' : '/login' })
  }

  return (
    <AuthPageShell
      mode="register"
      title="Create account"
      description="Start as a subscriber, then upgrade into a creator studio whenever you are ready."
      footer={
        <AuthFooter>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </AuthFooter>
      }
    >
      <Form {...form}>
        <form className="flex flex-col gap-5" onSubmit={form.handleSubmit(handleSubmit)} noValidate>
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      autoComplete="email"
                      {...field}
                    />
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
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Min. 8 characters"
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.formState.errors.root?.message && (
              <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
            )}
          </div>
          <Button type="submit" className="w-full tracking-normal normal-case" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
      </Form>
    </AuthPageShell>
  )
}
