import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { loginSchema } from '../lib/schemas'

type LoginFormValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  async function handleSubmit(values: LoginFormValues) {
    const { error, user: loggedInUser } = await login(values.email, values.password)
    if (error) {
      form.setError('root', { message: error })
    } else {
      await navigate({ to: loggedInUser?.role === 'creator' ? '/studio' : '/feed' })
    }
  }

  return (
    <AuthPageShell
      mode="login"
      title="Sign in"
      description="Enter your email and password to access your account."
      footer={
        <AuthFooter>
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Register
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
                      placeholder="Password"
                      autoComplete="current-password"
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
            {form.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </Form>
    </AuthPageShell>
  )
}
