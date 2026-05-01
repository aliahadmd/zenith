import { useEffect, useMemo } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { apiPutRequired } from '../lib/api'
import { authKeys } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import {
  avatarSettingsSchema,
  emailSettingsSchema,
  passwordSettingsSchema,
  profileSettingsSchema,
  usernameSettingsSchema,
} from '../lib/schemas'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'

type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>
type UsernameSettingsValues = z.infer<typeof usernameSettingsSchema>
type AvatarSettingsValues = z.infer<typeof avatarSettingsSchema>
type PasswordSettingsValues = z.infer<typeof passwordSettingsSchema>
type EmailSettingsValues = z.infer<typeof emailSettingsSchema>

export function SettingsPage() {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
  const socialLinks = useMemo(() => parseSocialLinks(currentUser?.socialLinks), [currentUser?.socialLinks])

  const profileForm = useForm<ProfileSettingsValues>({
    resolver: zodResolver(profileSettingsSchema),
    defaultValues: {
      displayName: currentUser?.displayName ?? '',
      tagline: currentUser?.tagline ?? '',
      twitter: socialLinks.twitter,
      github: socialLinks.github,
      website: socialLinks.website,
    },
  })
  const usernameForm = useForm<UsernameSettingsValues>({
    resolver: zodResolver(usernameSettingsSchema),
    defaultValues: { username: currentUser?.username ?? '' },
  })
  const avatarForm = useForm<AvatarSettingsValues>({
    resolver: zodResolver(avatarSettingsSchema),
  })
  const passwordForm = useForm<PasswordSettingsValues>({
    resolver: zodResolver(passwordSettingsSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  })
  const emailForm = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      newEmail: '',
      currentPassword: '',
    },
  })

  useEffect(() => {
    profileForm.reset({
      displayName: currentUser?.displayName ?? '',
      tagline: currentUser?.tagline ?? '',
      twitter: socialLinks.twitter,
      github: socialLinks.github,
      website: socialLinks.website,
    })
    usernameForm.reset({ username: currentUser?.username ?? '' })
  }, [currentUser, profileForm, socialLinks, usernameForm])

  const invalidateUserData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: authKeys.me }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
    ])
  }

  const profileMutation = useMutation({
    mutationFn: (values: ProfileSettingsValues) =>
      apiPutRequired('/api/settings/profile', {
        displayName: values.displayName,
        tagline: values.tagline || undefined,
        socialLinks: {
          twitter: values.twitter || undefined,
          github: values.github || undefined,
          website: values.website || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success('Profile updated successfully.')
      await invalidateUserData()
    },
  })

  const usernameMutation = useMutation({
    mutationFn: (values: UsernameSettingsValues) =>
      apiPutRequired('/api/settings/username', { newUsername: values.username }),
    onSuccess: async () => {
      toast.success('Username updated successfully.')
      await invalidateUserData()
    },
  })

  const avatarMutation = useMutation({
    mutationFn: (values: AvatarSettingsValues) => {
      const formData = new FormData()
      formData.append('avatar', values.avatar)
      return apiPutRequired('/api/settings/avatar', formData)
    },
    onSuccess: async () => {
      toast.success('Avatar updated successfully.')
      avatarForm.reset()
      await invalidateUserData()
    },
  })

  const passwordMutation = useMutation({
    mutationFn: (values: PasswordSettingsValues) =>
      apiPutRequired('/api/settings/password', {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: () => {
      toast.success('Password updated successfully.')
      passwordForm.reset()
    },
  })

  const emailMutation = useMutation({
    mutationFn: (values: EmailSettingsValues) =>
      apiPutRequired('/api/settings/email', {
        newEmail: values.newEmail,
        currentPassword: values.currentPassword,
      }),
    onSuccess: async () => {
      toast.success('Email updated successfully.')
      emailForm.reset()
      await queryClient.invalidateQueries({ queryKey: authKeys.me })
    },
  })

  const avatarFile = useWatch({ control: avatarForm.control, name: 'avatar' })
  const avatarPreview = useMemo(() => {
    if (!avatarFile) return null
    return URL.createObjectURL(avatarFile)
  }, [avatarFile])

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview)
    }
  }, [avatarPreview])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Public Profile</CardTitle>
          <CardDescription>Update your display name, tagline, and social links</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form
              onSubmit={profileForm.handleSubmit((values) => profileMutation.mutateAsync(values).catch((error: Error) => {
                profileForm.setError('root', { message: error.message })
              }))}
              className="flex flex-col gap-4"
              noValidate
            >
              <InputField form={profileForm} name="displayName" label="Display name" autoComplete="name" />
              <InputField form={profileForm} name="tagline" label="Tagline" placeholder="A short bio or tagline" />
              <InputField form={profileForm} name="twitter" label="Twitter URL" type="url" placeholder="https://twitter.com/yourhandle" />
              <InputField form={profileForm} name="github" label="GitHub URL" type="url" placeholder="https://github.com/yourhandle" />
              <InputField form={profileForm} name="website" label="Website URL" type="url" placeholder="https://yourwebsite.com" />
              <RootError message={profileForm.formState.errors.root?.message} />
              <Button type="submit" disabled={profileForm.formState.isSubmitting}>
                {profileForm.formState.isSubmitting ? 'Saving…' : 'Save profile'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Username</CardTitle>
          <CardDescription>Change your public username</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...usernameForm}>
            <form
              onSubmit={usernameForm.handleSubmit((values) => usernameMutation.mutateAsync(values).catch((error: Error) => {
                usernameForm.setError('root', { message: error.message })
              }))}
              className="flex flex-col gap-4"
              noValidate
            >
              <InputField form={usernameForm} name="username" label="Username" autoComplete="username" />
              <p className="text-xs text-muted-foreground">
                3-10 characters, lowercase letters, numbers, _ and - only
              </p>
              <RootError message={usernameForm.formState.errors.root?.message} />
              <Button type="submit" disabled={usernameForm.formState.isSubmitting}>
                {usernameForm.formState.isSubmitting ? 'Updating…' : 'Update username'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>Upload a new profile picture (JPEG, PNG, or WebP, max 5 MB)</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...avatarForm}>
            <form
              onSubmit={avatarForm.handleSubmit((values) => avatarMutation.mutateAsync(values).catch((error: Error) => {
                avatarForm.setError('root', { message: error.message })
              }))}
              className="flex flex-col gap-4"
              noValidate
            >
              {avatarPreview && (
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="size-24 rounded-full object-cover"
                />
              )}
              <FormField
                control={avatarForm.control}
                name="avatar"
                render={({ field: { onChange, ref, name, onBlur } }) => (
                  <FormItem>
                    <FormLabel>Choose image</FormLabel>
                    <FormControl>
                      <Input
                        ref={ref}
                        name={name}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onBlur={onBlur}
                        onChange={(event) => onChange(event.target.files?.[0])}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <RootError message={avatarForm.formState.errors.root?.message} />
              <Button type="submit" disabled={avatarForm.formState.isSubmitting}>
                {avatarForm.formState.isSubmitting ? 'Uploading…' : 'Upload'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form
              onSubmit={passwordForm.handleSubmit((values) => passwordMutation.mutateAsync(values).catch((error: Error) => {
                passwordForm.setError('root', { message: error.message })
              }))}
              className="flex flex-col gap-4"
              noValidate
            >
              <InputField form={passwordForm} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
              <InputField form={passwordForm} name="newPassword" label="New password" type="password" autoComplete="new-password" />
              <InputField form={passwordForm} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
              <RootError message={passwordForm.formState.errors.root?.message} />
              <Button type="submit" disabled={passwordForm.formState.isSubmitting}>
                {passwordForm.formState.isSubmitting ? 'Updating…' : 'Update password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change Email</CardTitle>
          <CardDescription>Update the email address linked to your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...emailForm}>
            <form
              onSubmit={emailForm.handleSubmit((values) => emailMutation.mutateAsync(values).catch((error: Error) => {
                emailForm.setError('root', { message: error.message })
              }))}
              className="flex flex-col gap-4"
              noValidate
            >
              <InputField form={emailForm} name="newEmail" label="New email address" type="email" autoComplete="email" />
              <InputField form={emailForm} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
              <RootError message={emailForm.formState.errors.root?.message} />
              <Button type="submit" disabled={emailForm.formState.isSubmitting}>
                {emailForm.formState.isSubmitting ? 'Updating…' : 'Update email'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}

function InputField<T extends FieldValues>({
  form,
  name,
  label,
  type = 'text',
  placeholder,
  autoComplete,
}: {
  form: UseFormReturn<T>
  name: Path<T>
  label: string
  type?: string
  placeholder?: string
  autoComplete?: string
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              type={type}
              placeholder={placeholder}
              autoComplete={autoComplete}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

function RootError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

function parseSocialLinks(raw: string | null | undefined) {
  if (!raw) return { twitter: '', github: '', website: '' }
  try {
    const parsed = JSON.parse(raw) as Record<string, string>
    return {
      twitter: parsed.twitter ?? '',
      github: parsed.github ?? '',
      website: parsed.website ?? '',
    }
  } catch {
    return { twitter: '', github: '', website: '' }
  }
}
