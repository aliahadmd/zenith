import { useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bell, Compass, GripVertical, KeyRound, Loader2, PanelsTopLeft, ShieldCheck, UserRound } from 'lucide-react'
import { useForm, useWatch, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { apiPutRequired } from '../lib/api'
import { authKeys, requestEmailChangeOtp, verifyEmailChangeOtp } from '../lib/auth'
import { useAuth } from '../context/AuthContext'
import {
  avatarSettingsSchema,
  emailOtpSettingsSchema,
  emailSettingsSchema,
  profileSettingsSchema,
  usernameSettingsSchema,
} from '../lib/schemas'
import {
  profileTabDescription,
  profileTabsKeys,
  profileTabsQueryOptions,
  updateProfileTabs,
  type ProfileTabSetting,
} from '../lib/profile-tabs'
import {
  notificationKeys,
  notificationPreferencesQueryOptions,
  updateNotificationPreferences as saveNotificationPreferences,
  type NotificationPreferences,
} from '../lib/notifications'
import { cn } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../components/ui/input-otp'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../components/ui/form'
import { Switch } from '../components/ui/switch'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import { DiscoverySettingsPanel } from '../components/DiscoverySettingsPanel'

type ProfileSettingsValues = z.infer<typeof profileSettingsSchema>
type UsernameSettingsValues = z.infer<typeof usernameSettingsSchema>
type AvatarSettingsValues = z.infer<typeof avatarSettingsSchema>
type EmailSettingsValues = z.infer<typeof emailSettingsSchema>
type EmailOtpSettingsValues = z.infer<typeof emailOtpSettingsSchema>

export type SettingsSection = 'profile' | 'profile-tabs' | 'discovery' | 'account' | 'notifications' | 'security'

const settingsNavItems: Array<{
  section: SettingsSection
  label: string
  description: string
  to: '/settings/profile' | '/settings/profile-tabs' | '/settings/discovery' | '/settings/account' | '/settings/notifications' | '/settings/security'
  icon: typeof UserRound
}> = [
  {
    section: 'profile',
    label: 'Profile',
    description: 'Public identity',
    to: '/settings/profile',
    icon: UserRound,
  },
  {
    section: 'profile-tabs',
    label: 'Profile Tabs',
    description: 'Order and visibility',
    to: '/settings/profile-tabs',
    icon: PanelsTopLeft,
  },
  {
    section: 'discovery',
    label: 'Discovery',
    description: 'Interests and categories',
    to: '/settings/discovery',
    icon: Compass,
  },
  {
    section: 'account',
    label: 'Account',
    description: 'Username and email',
    to: '/settings/account',
    icon: ShieldCheck,
  },
  {
    section: 'notifications',
    label: 'Notifications',
    description: 'Email preferences',
    to: '/settings/notifications',
    icon: Bell,
  },
  {
    section: 'security',
    label: 'Security',
    description: 'Email codes',
    to: '/settings/security',
    icon: KeyRound,
  },
]

const sectionCopy: Record<SettingsSection, { title: string; description: string }> = {
  profile: {
    title: 'Profile',
    description: 'Manage the public details people see on your profile.',
  },
  'profile-tabs': {
    title: 'Profile Tabs',
    description: 'Choose which profile sections appear first and which move into More.',
  },
  discovery: {
    title: 'Discovery',
    description: 'Manage recommendation interests and public creator categories.',
  },
  account: {
    title: 'Account',
    description: 'Manage your username and email address.',
  },
  notifications: {
    title: 'Notifications',
    description: 'Choose which updates can also arrive by email.',
  },
  security: {
    title: 'Security',
    description: 'Zenith uses email codes instead of account passwords.',
  },
}

export function SettingsPage({ section = 'profile' }: { section?: SettingsSection }) {
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
  const emailForm = useForm<EmailSettingsValues>({
    resolver: zodResolver(emailSettingsSchema),
    defaultValues: {
      newEmail: '',
    },
  })
  const emailOtpForm = useForm<EmailOtpSettingsValues>({
    resolver: zodResolver(emailOtpSettingsSchema),
    defaultValues: { otp: '' },
  })
  const [pendingEmail, setPendingEmail] = useState('')

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

  const emailRequestMutation = useMutation({
    mutationFn: (values: EmailSettingsValues) =>
      requestEmailChangeOtp({ newEmail: values.newEmail }),
    onSuccess: (_data, values) => {
      setPendingEmail(values.newEmail)
      emailOtpForm.reset({ otp: '' })
      toast.success('Email code sent.')
    },
  })

  const emailVerifyMutation = useMutation({
    mutationFn: (values: EmailOtpSettingsValues) =>
      verifyEmailChangeOtp({ newEmail: pendingEmail, otp: values.otp }),
    onSuccess: async () => {
      toast.success('Email updated successfully.')
      emailForm.reset()
      emailOtpForm.reset()
      setPendingEmail('')
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

  const currentSection = sectionCopy[section]

  return (
    <div className="grid w-full max-w-5xl gap-6 py-2 lg:grid-cols-[15rem_minmax(0,1fr)] lg:py-8">
      <aside className="min-w-0">
        <div className="lg:sticky lg:top-6">
          <div className="mb-4">
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="mt-1 text-sm text-muted-foreground">Manage profile, account, and security details.</p>
          </div>
          <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {settingsNavItems.map((item) => {
              const Icon = item.icon
              const isActive = item.section === section

              return (
                <Link
                  key={item.section}
                  to={item.to}
                  className={cn(
                    'flex min-w-44 items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-card/50 lg:min-w-0',
                    isActive ? 'border-primary/50 bg-card text-foreground' : 'border-transparent text-muted-foreground',
                  )}
                >
                  <Icon data-icon="inline-start" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>

      <main className="min-w-0">
        <div className="mb-6">
          <h2 className="text-2xl font-semibold">{currentSection.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{currentSection.description}</p>
        </div>

        <div className="flex flex-col gap-5">
          {section === 'profile' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="tracking-normal normal-case">Public profile</CardTitle>
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
                      <Button type="submit" className="self-start tracking-normal normal-case" disabled={profileForm.formState.isSubmitting}>
                        {profileForm.formState.isSubmitting ? 'Saving…' : 'Save profile'}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="tracking-normal normal-case">Profile picture</CardTitle>
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
                      <Button type="submit" className="self-start tracking-normal normal-case" disabled={avatarForm.formState.isSubmitting}>
                        {avatarForm.formState.isSubmitting ? 'Uploading…' : 'Upload'}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </>
          )}

          {section === 'profile-tabs' && (
            <ProfileTabsSettings />
          )}

          {section === 'discovery' && (
            <DiscoverySettingsPanel />
          )}

          {section === 'account' && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="tracking-normal normal-case">Username</CardTitle>
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
                      <Button type="submit" className="self-start tracking-normal normal-case" disabled={usernameForm.formState.isSubmitting}>
                        {usernameForm.formState.isSubmitting ? 'Updating…' : 'Update username'}
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="tracking-normal normal-case">Change email</CardTitle>
                  <CardDescription>Confirm a new email with a 6-digit code</CardDescription>
                </CardHeader>
                <CardContent>
                  {!pendingEmail ? (
                    <Form {...emailForm}>
                      <form
                        onSubmit={emailForm.handleSubmit((values) => emailRequestMutation.mutateAsync(values).catch((error: Error) => {
                          emailForm.setError('root', { message: error.message })
                        }))}
                        className="flex flex-col gap-4"
                        noValidate
                      >
                        <InputField form={emailForm} name="newEmail" label="New email address" type="email" autoComplete="email" />
                        <RootError message={emailForm.formState.errors.root?.message} />
                        <Button type="submit" className="self-start tracking-normal normal-case" disabled={emailForm.formState.isSubmitting}>
                          {emailForm.formState.isSubmitting ? 'Sending…' : 'Send email code'}
                        </Button>
                      </form>
                    </Form>
                  ) : (
                    <Form {...emailOtpForm}>
                      <form
                        onSubmit={emailOtpForm.handleSubmit((values) => emailVerifyMutation.mutateAsync(values).catch((error: Error) => {
                          emailOtpForm.setError('root', { message: error.message })
                        }))}
                        className="flex flex-col gap-4"
                        noValidate
                      >
                        <p className="text-sm text-muted-foreground">Enter the code sent to {pendingEmail}.</p>
                        <FormField
                          control={emailOtpForm.control}
                          name="otp"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Verification code</FormLabel>
                              <FormControl>
                                <InputOTP
                                  maxLength={6}
                                  value={field.value}
                                  onChange={(value) => emailOtpForm.setValue('otp', value, { shouldDirty: true, shouldValidate: true })}
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
                        <RootError message={emailOtpForm.formState.errors.root?.message} />
                        <div className="flex flex-wrap gap-3">
                          <Button type="submit" className="tracking-normal normal-case" disabled={emailOtpForm.formState.isSubmitting}>
                            {emailOtpForm.formState.isSubmitting ? 'Updating…' : 'Confirm email'}
                          </Button>
                          <Button type="button" variant="outline" className="tracking-normal normal-case" onClick={() => setPendingEmail('')}>
                            Change email
                          </Button>
                        </div>
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {section === 'notifications' && (
            <NotificationSettings />
          )}

          {section === 'security' && (
            <Card>
              <CardHeader>
                <CardTitle className="tracking-normal normal-case">Passwordless sign-in</CardTitle>
                <CardDescription>Your account is protected by short-lived email codes.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="rounded-md border bg-card px-3 py-3">
                  <p className="text-sm font-medium">No password to manage</p>
                  <p className="text-xs text-muted-foreground">
                    Sign-in codes expire after 5 minutes and are sent only through Zenith email delivery.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

function NotificationSettings() {
  const queryClient = useQueryClient()
  const preferencesQuery = useQuery(notificationPreferencesQueryOptions)
  const [draft, setDraft] = useState<Partial<NotificationPreferences> | null>(null)
  const serverPreferences = preferencesQuery.data?.preferences ?? null
  const preferences = serverPreferences ? { ...serverPreferences, ...(draft ?? {}) } : null

  const saveMutation = useMutation({
    mutationFn: () => preferences ? saveNotificationPreferences(preferences) : Promise.reject(new Error('Preferences are not loaded')),
    onSuccess: async () => {
      setDraft(null)
      toast.success('Notification preferences updated.')
      await queryClient.invalidateQueries({ queryKey: notificationKeys.preferences })
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Notification preferences could not be saved.')
    },
  })

  if (preferencesQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="tracking-normal normal-case">Notification preferences unavailable</CardTitle>
          <CardDescription>{preferencesQuery.error.message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (preferencesQuery.isPending || !preferences) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-80" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }

  const updateDraft = (values: Partial<NotificationPreferences>) => {
    setDraft((current) => ({ ...(current ?? {}), ...values }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="tracking-normal normal-case">Email notifications</CardTitle>
        <CardDescription>In-app notifications always stay on. Email delivery depends on Cloudflare Email Routing.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <PreferenceSwitch
          label="Email notifications"
          description="Allow this account to receive notification emails."
          checked={preferences.emailEnabled}
          onCheckedChange={(checked) => updateDraft({ emailEnabled: checked })}
        />
        <PreferenceSwitch
          label="Creator content"
          description="New posts, articles, audio, and photography from creators you subscribe to."
          checked={preferences.contentEmailEnabled}
          disabled={!preferences.emailEnabled}
          onCheckedChange={(checked) => updateDraft({ contentEmailEnabled: checked })}
        />
        <PreferenceSwitch
          label="Interactions"
          description="Replies and likes on your content."
          checked={preferences.interactionEmailEnabled}
          disabled={!preferences.emailEnabled}
          onCheckedChange={(checked) => updateDraft({ interactionEmailEnabled: checked })}
        />
        <PreferenceSwitch
          label="Subscriptions and payments"
          description="Membership starts, active subscriptions, and payment issues."
          checked={preferences.subscriptionEmailEnabled}
          disabled={!preferences.emailEnabled}
          onCheckedChange={(checked) => updateDraft({ subscriptionEmailEnabled: checked })}
        />
        <Button
          type="button"
          className="self-start tracking-normal normal-case"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Save notification settings
        </Button>
      </CardContent>
    </Card>
  )
}

function PreferenceSwitch({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border bg-card px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch size="sm" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

function ProfileTabsSettings() {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [customTabs, setCustomTabs] = useState<ProfileTabSetting[] | null>(null)
  const profileTabsQuery = useQuery(profileTabsQueryOptions(currentUser?.role === 'creator'))
  const tabs = customTabs ?? profileTabsQuery.data?.tabs ?? []
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const saveMutation = useMutation({
    mutationFn: () => updateProfileTabs(tabs.map((tab) => ({ key: tab.key, visible: tab.visible }))),
    onSuccess: async (data) => {
      setCustomTabs(data.tabs)
      toast.success('Profile tabs updated.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: profileTabsKeys.settings }),
        queryClient.invalidateQueries({ queryKey: authKeys.me }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        currentUser?.username
          ? queryClient.invalidateQueries({ queryKey: ['profile', currentUser.username] })
          : Promise.resolve(),
      ])
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Profile tabs could not be saved.')
    },
  })

  if (currentUser?.role !== 'creator') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="tracking-normal normal-case">Creator profiles only</CardTitle>
          <CardDescription>Upgrade to creator before managing profile tab visibility and order.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (profileTabsQuery.isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (profileTabsQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="tracking-normal normal-case">Profile tabs unavailable</CardTitle>
          <CardDescription>{profileTabsQuery.error.message}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const visibleTabs = tabs.filter((tab) => tab.visible)
  const primaryTabs = visibleTabs.slice(0, 4)
  const overflowTabs = visibleTabs.slice(4)
  const hasVisibleTab = visibleTabs.length > 0

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setCustomTabs((currentTabs) => {
      const baseTabs = currentTabs ?? tabs
      const oldIndex = baseTabs.findIndex((tab) => tab.key === active.id)
      const newIndex = baseTabs.findIndex((tab) => tab.key === over.id)
      return arrayMove(baseTabs, oldIndex, newIndex).map((tab, index) => ({ ...tab, order: index }))
    })
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="tracking-normal normal-case">Profile tab order</CardTitle>
          <CardDescription>
            Drag tabs into the order you want. The first four visible tabs appear directly on your profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tabs.map((tab) => tab.key)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {tabs.map((tab) => (
                  <SortableTabRow
                    key={tab.key}
                    tab={tab}
                    onVisibleChange={(visible) => {
                      setCustomTabs((currentTabs) => (currentTabs ?? tabs).map((currentTab) => (
                        currentTab.key === tab.key ? { ...currentTab, visible } : currentTab
                      )))
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {!hasVisibleTab && (
            <p className="text-sm text-destructive">At least one tab must remain visible.</p>
          )}

          <Button
            type="button"
            className="self-start tracking-normal normal-case"
            disabled={!hasVisibleTab || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
            Save tab settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="tracking-normal normal-case">Profile preview</CardTitle>
          <CardDescription>Visible tabs after the fourth item move into the More menu automatically.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Primary tabs</p>
            <div className="flex flex-wrap gap-2">
              {primaryTabs.length > 0 ? primaryTabs.map((tab) => (
                <Badge key={tab.key} variant="secondary" className="normal-case tracking-normal">
                  {tab.label}
                </Badge>
              )) : (
                <span className="text-sm text-muted-foreground">No visible tabs.</span>
              )}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">More menu</p>
            <div className="flex flex-wrap gap-2">
              {overflowTabs.length > 0 ? overflowTabs.map((tab) => (
                <Badge key={tab.key} variant="outline" className="normal-case tracking-normal">
                  {tab.label}
                </Badge>
              )) : (
                <span className="text-sm text-muted-foreground">No overflow tabs.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function SortableTabRow({
  tab,
  onVisibleChange,
}: {
  tab: ProfileTabSetting
  onVisibleChange: (visible: boolean) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.key })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-md border bg-card px-3 py-3',
        isDragging && 'opacity-70',
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Move ${tab.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tab.label}</p>
        <p className="truncate text-xs text-muted-foreground">{profileTabDescription(tab.key)}</p>
      </div>
      <Switch
        size="sm"
        checked={tab.visible}
        onCheckedChange={onVisibleChange}
        aria-label={`${tab.visible ? 'Hide' : 'Show'} ${tab.label}`}
      />
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
