import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { registerRequest, resendVerificationRequest } from '../lib/auth'
import { authRegisterSchema } from '../lib/schemas'

type RegisterValues = {
  email: string
  password: string
  confirmPassword: string
}

export function RegisterPage() {
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const form = useForm<RegisterValues>({
    resolver: zodResolver(authRegisterSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  })
  const registerMutation = useMutation({ mutationFn: registerRequest })
  const resendMutation = useMutation({ mutationFn: resendVerificationRequest })

  async function handleSubmit(values: RegisterValues) {
    try {
      const result = await registerMutation.mutateAsync({ email: values.email, password: values.password })
      setRegisteredEmail(result.email)
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Could not create the account.',
      })
    }
  }

  if (registeredEmail) {
    return (
      <AuthPageShell
        mode="register"
        title="Check your inbox"
        description={`We sent a verification link to ${registeredEmail}. Click it to activate your account.`}
        footer={
          <AuthFooter>
            Already verified?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Sign in
            </Link>
          </AuthFooter>
        }
      >
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="tracking-normal normal-case"
            disabled={resendMutation.isPending}
            onClick={() => {
              resendMutation.mutate({ email: registeredEmail }, {
                onSuccess: () => setResent(true),
              })
            }}
          >
            {resendMutation.isPending ? 'Resending...' : 'Resend verification email'}
          </Button>
          {resent ? (
            <p className="text-sm text-muted-foreground">Verification email sent. Check your inbox.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The link expires in 1 hour. Sign-in stays locked until your email is verified.
          </p>
        </div>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell
      mode="register"
      title="Create account"
      description="Choose an email and password. Zenith will send a verification link before you can sign in."
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
                <FormLabel>Password</FormLabel>
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
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="Repeat your password" autoComplete="new-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <RootError message={form.formState.errors.root?.message} />
          <Button type="submit" className="w-full tracking-normal normal-case" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Creating account...' : 'Create account'}
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
