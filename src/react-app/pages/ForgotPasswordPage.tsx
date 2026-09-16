import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { forgotPasswordRequest } from '../lib/auth'
import { authEmailSchema } from '../lib/schemas'

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<{ email: string }>({
    resolver: zodResolver(authEmailSchema),
    defaultValues: { email: '' },
  })
  const forgotMutation = useMutation({ mutationFn: forgotPasswordRequest })

  async function handleSubmit(values: { email: string }) {
    try {
      await forgotMutation.mutateAsync(values)
      setSentTo(values.email)
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : 'Could not send the reset email.',
      })
    }
  }

  if (sentTo) {
    return (
      <AuthPageShell
        mode="login"
        title="Check your inbox"
        description={`If ${sentTo} belongs to a Zenith account, we sent a password reset link to it.`}
        footer={
          <AuthFooter>
            Remembered it?{' '}
            <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </AuthFooter>
        }
      >
        <p className="text-sm text-muted-foreground">The reset link expires in 1 hour.</p>
      </AuthPageShell>
    )
  }

  return (
    <AuthPageShell
      mode="login"
      title="Reset your password"
      description="Enter your email and Zenith will send a password reset link."
      footer={
        <AuthFooter>
          Remembered it?{' '}
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
          <RootError message={form.formState.errors.root?.message} />
          <Button type="submit" className="w-full tracking-normal normal-case" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Sending reset link...' : 'Send reset link'}
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
