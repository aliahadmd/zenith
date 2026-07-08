import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'
import { AuthFooter, AuthPageShell } from '../components/AuthPageShell'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { requestOtp } from '../lib/auth'
import { ApiError } from '../lib/api'
import { authEmailSchema, authOtpSchema } from '../lib/schemas'

type EmailFormValues = z.infer<typeof authEmailSchema>
type OtpFormValues = z.infer<typeof authOtpSchema>

export function LoginPage() {
  const { completeOtpSignIn } = useAuth()
  const navigate = useNavigate()
  const [submittedEmail, setSubmittedEmail] = useState('')
  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(authEmailSchema),
    defaultValues: { email: '' },
  })
  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(authOtpSchema),
    defaultValues: { otp: '' },
  })
  const otpRequest = useMutation({ mutationFn: requestOtp })

  async function handleEmailSubmit(values: EmailFormValues) {
    try {
      await otpRequest.mutateAsync({ email: values.email })
      setSubmittedEmail(values.email)
      otpForm.reset({ otp: '' })
    } catch (error) {
      emailForm.setError('root', { message: otpRequestError(error) })
    }
  }

  async function handleOtpSubmit(values: OtpFormValues) {
    const { error, user } = await completeOtpSignIn(submittedEmail, values.otp)
    if (error) {
      otpForm.setError('root', { message: error })
      return
    }
    await navigate({ to: user ? '/feed' : '/login' })
  }

  const isOtpStep = Boolean(submittedEmail)

  return (
    <AuthPageShell
      mode="login"
      title="Sign in"
      description={isOtpStep ? `Enter the code sent to ${submittedEmail}.` : 'Enter your email and Zenith will send a sign-in code.'}
      footer={
        <AuthFooter>
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Register
          </Link>
        </AuthFooter>
      }
    >
      {!isOtpStep ? (
        <Form {...emailForm}>
          <form className="flex flex-col gap-5" onSubmit={emailForm.handleSubmit(handleEmailSubmit)} noValidate>
            <FormField
              control={emailForm.control}
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
            <RootError message={emailForm.formState.errors.root?.message} />
            <Button type="submit" className="w-full tracking-normal normal-case" disabled={emailForm.formState.isSubmitting}>
              {emailForm.formState.isSubmitting ? 'Sending code...' : 'Send sign-in code'}
            </Button>
          </form>
        </Form>
      ) : (
        <Form {...otpForm}>
          <form className="flex flex-col gap-5" onSubmit={otpForm.handleSubmit(handleOtpSubmit)} noValidate>
            <FormField
              control={otpForm.control}
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Verification code</FormLabel>
                  <FormControl>
                    <InputOTP
                      maxLength={6}
                      value={field.value}
                      onChange={(value) => otpForm.setValue('otp', value, { shouldDirty: true, shouldValidate: true })}
                    >
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <InputOTPSlot key={index} index={index} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <RootError message={otpForm.formState.errors.root?.message} />
            <Button type="submit" className="w-full tracking-normal normal-case" disabled={otpForm.formState.isSubmitting}>
              {otpForm.formState.isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
            <div className="flex items-center justify-between gap-3 text-sm">
              <Button
                type="button"
                variant="ghost"
                className="px-0 tracking-normal normal-case"
                disabled={otpRequest.isPending}
                onClick={() => {
                  otpRequest.mutate({ email: submittedEmail }, {
                    onSuccess: () => otpForm.reset({ otp: '' }),
                    onError: (error) => otpForm.setError('root', { message: otpRequestError(error) }),
                  })
                }}
              >
                {otpRequest.isPending ? 'Resending...' : 'Resend code'}
              </Button>
              <Button type="button" variant="ghost" className="px-0 tracking-normal normal-case" onClick={() => setSubmittedEmail('')}>
                Change email
              </Button>
            </div>
          </form>
        </Form>
      )}
    </AuthPageShell>
  )
}

function otpRequestError(error: unknown) {
  if (error instanceof ApiError && error.code === 'otp_email_unavailable') {
    return 'Email delivery is unavailable for this address. Use a verified beta recipient.'
  }
  return error instanceof Error ? error.message : 'Could not send a sign-in code.'
}

function RootError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}
