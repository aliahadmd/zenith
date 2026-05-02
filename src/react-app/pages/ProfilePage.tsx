import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Globe, Loader2 } from 'lucide-react'
import { FaLinkedin } from 'react-icons/fa6'
import { SiGithub, SiInstagram, SiX, SiYoutube } from 'react-icons/si'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { apiGetRequired } from '../lib/api'
import {
  formatCurrency,
  formatUnixDate,
  paymentKeys,
  startCheckout,
  subscribeFree,
  subscriptionOptionsQueryOptions,
  type SubscriptionOptionsResponse,
} from '../lib/payments'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Badge } from '../components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { Skeleton } from '../components/ui/skeleton'
import { LoadingBlock } from '../components/LoadingBlock'

type ProfileData = {
  id: string
  displayName: string
  username: string
  role: 'subscriber' | 'creator'
  tagline: string | null
  avatarUrl: string | null
  socialLinks: string | null
}

type Subscription = {
  displayName: string
  username: string
  avatarUrl: string | null
}

type SubscriptionsResponse = {
  subscriptions: Subscription[]
}

export function ProfilePage({ username }: { username: string }) {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [pendingFreeKind, setPendingFreeKind] = useState<'free' | 'trial' | null>(null)

  const isOwnProfile = currentUser?.username === username
  const defaultTab = isOwnProfile ? 'subscribed' : 'about'

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => apiGetRequired<ProfileData>(`/api/profile/${username}`),
  })
  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', username],
    queryFn: () => apiGetRequired<SubscriptionsResponse>(`/api/profile/${username}/subscriptions`),
  })
  const subscriptionOptionsQuery = useQuery(subscriptionOptionsQueryOptions(
    username,
    Boolean(profileQuery.data?.role === 'creator' && !isOwnProfile),
  ))
  const freeSubscribeMutation = useMutation({
    mutationFn: subscribeFree,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: paymentKeys.subscriptionOptions(username) }),
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] }),
      ])
      setPendingFreeKind(null)
      toast.success('Subscription activated.')
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Subscription could not be activated.')
    },
  })
  const checkoutMutation = useMutation({
    mutationFn: startCheckout,
    onSuccess: ({ url }) => {
      window.location.href = url
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Checkout could not be started.')
    },
  })

  if (profileQuery.isPending || subscriptionsQuery.isPending) {
    return <LoadingBlock label="Loading profile" />
  }

  if (profileQuery.isError) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <p>{profileQuery.error.message}</p>
      </div>
    )
  }

  const profile = profileQuery.data
  const subscriptions = subscriptionsQuery.data?.subscriptions ?? []
  const socialLinks = Object.entries(parseSocialLinks(profile.socialLinks))
    .filter(([, url]) => Boolean(url))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Profile header */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-5 sm:flex-row sm:items-start">
        <Avatar className="size-20 sm:size-24">
          <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.displayName} />
          <AvatarFallback className="text-2xl font-semibold">
            {profile.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{profile.displayName}</h1>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.tagline && (
            <p className="mt-3 max-w-prose text-sm leading-6">{profile.tagline}</p>
          )}
          {socialLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {socialLinks.map(([platform, url]) => (
                <SocialLinkIcon key={platform} platform={platform} url={url} />
              ))}
            </div>
          )}
        </div>
      </div>

      {profile.role === 'creator' && !isOwnProfile && (
        <SubscriptionOptionsCard
          options={subscriptionOptionsQuery.data}
          isLoading={subscriptionOptionsQuery.isPending}
          error={subscriptionOptionsQuery.isError ? subscriptionOptionsQuery.error.message : null}
          onChooseFree={setPendingFreeKind}
          onChoosePaid={(interval) => checkoutMutation.mutate({ creatorId: profile.id, interval })}
          isStartingCheckout={checkoutMutation.isPending}
        />
      )}

      {/* Tabs */}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="subscribed">Subscribed to</TabsTrigger>
        </TabsList>
        <TabsContent value="about" className="mt-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm leading-6 text-muted-foreground">
                {profile.tagline ?? 'No bio yet.'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="subscribed" className="mt-4">
          {subscriptions.length === 0 ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-sm text-muted-foreground">Not subscribed to any creators yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {subscriptions.map((sub) => (
                <Link
                  to="/u/$username"
                  params={{ username: sub.username }}
                  key={sub.username}
                  className="flex min-h-14 items-center gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent/70"
                >
                  <Avatar>
                    <AvatarImage src={sub.avatarUrl ?? undefined} alt={sub.displayName} />
                    <AvatarFallback>{sub.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium leading-tight">{sub.displayName}</p>
                    <p className="text-sm text-muted-foreground">@{sub.username}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={pendingFreeKind !== null} onOpenChange={(open) => !open && setPendingFreeKind(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingFreeKind === 'trial' ? 'Start free trial?' : 'Start free subscription?'}
            </DialogTitle>
            <DialogDescription>
              This will add the creator to your feed immediately without opening Stripe Checkout.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="normal-case tracking-normal"
              onClick={() => setPendingFreeKind(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="normal-case tracking-normal"
              disabled={!pendingFreeKind || freeSubscribeMutation.isPending}
              onClick={() => {
                if (!pendingFreeKind) return
                freeSubscribeMutation.mutate({ creatorId: profile.id, kind: pendingFreeKind })
              }}
            >
              {freeSubscribeMutation.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SubscriptionOptionsCard({
  options,
  isLoading,
  error,
  onChooseFree,
  onChoosePaid,
  isStartingCheckout,
}: {
  options: SubscriptionOptionsResponse | undefined
  isLoading: boolean
  error: string | null
  onChooseFree: (kind: 'free' | 'trial') => void
  onChoosePaid: (interval: 'monthly' | 'yearly') => void
  isStartingCheckout: boolean
}) {
  if (isLoading) {
    return (
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card size="sm">
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (!options) return null

  const { plan, viewerMembership } = options
  const hasOptions = plan.freePermanentEnabled || plan.freeTrialEnabled || plan.paidEnabled

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="normal-case tracking-normal">{plan.name}</CardTitle>
        <CardDescription>
          {plan.description || 'Subscribe to see this creator in your feed.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {viewerMembership?.entitled && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="normal-case tracking-normal">{viewerMembership.accessType}</Badge>
              <span className="text-muted-foreground capitalize">
                {viewerMembership.status.replace('_', ' ')}
              </span>
            </div>
            {viewerMembership.trialEndsAt && (
              <p className="text-muted-foreground">Trial ends {formatUnixDate(viewerMembership.trialEndsAt)}.</p>
            )}
          </div>
        )}

        {!hasOptions && (
          <p className="text-sm text-muted-foreground">This creator has not opened subscriptions yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {plan.freePermanentEnabled && (
            <Button
              type="button"
              variant="outline"
              className="normal-case tracking-normal"
              disabled={viewerMembership?.entitled}
              onClick={() => onChooseFree('free')}
            >
              Free access
            </Button>
          )}
          {plan.freeTrialEnabled && (
            <Button
              type="button"
              variant="outline"
              className="normal-case tracking-normal"
              disabled={viewerMembership?.entitled}
              onClick={() => onChooseFree('trial')}
            >
              {plan.freeTrialDays ?? 7}-day trial
            </Button>
          )}
        </div>

        {plan.paidEnabled && (
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.prices.monthly && (
              <Button
                type="button"
                className="normal-case tracking-normal"
                disabled={isStartingCheckout || viewerMembership?.accessType === 'paid'}
                onClick={() => onChoosePaid('monthly')}
              >
                {isStartingCheckout && <Loader2 data-icon="inline-start" className="animate-spin" />}
                {formatCurrency(plan.prices.monthly.amountCents, plan.currency)} / month
              </Button>
            )}
            {plan.prices.yearly && (
              <Button
                type="button"
                className="normal-case tracking-normal"
                disabled={isStartingCheckout || viewerMembership?.accessType === 'paid'}
                onClick={() => onChoosePaid('yearly')}
              >
                {formatCurrency(plan.prices.yearly.amountCents, plan.currency)} / year
              </Button>
            )}
          </div>
        )}
      </CardContent>
      {viewerMembership?.entitled && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">You already have feed access for this creator.</p>
        </CardFooter>
      )}
    </Card>
  )
}

function SocialLinkIcon({ platform, url }: { platform: string; url: string }) {
  const normalized = platform.toLowerCase()
  const label = getSocialLabel(normalized)

  return (
    <Button asChild variant="outline" size="icon-sm">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open ${label} profile`}
        title={label}
      >
        <SocialIcon platform={normalized} />
      </a>
    </Button>
  )
}

function SocialIcon({ platform }: { platform: string }) {
  if (platform === 'twitter' || platform === 'x') return <SiX aria-hidden="true" />
  if (platform === 'github') return <SiGithub aria-hidden="true" />
  if (platform === 'linkedin') return <FaLinkedin aria-hidden="true" />
  if (platform === 'instagram') return <SiInstagram aria-hidden="true" />
  if (platform === 'youtube') return <SiYoutube aria-hidden="true" />
  if (platform === 'website') return <Globe aria-hidden="true" />
  return <ExternalLink aria-hidden="true" />
}

function getSocialLabel(platform: string): string {
  if (platform === 'twitter' || platform === 'x') return 'X'
  if (platform === 'github') return 'GitHub'
  if (platform === 'linkedin') return 'LinkedIn'
  if (platform === 'instagram') return 'Instagram'
  if (platform === 'youtube') return 'YouTube'
  if (platform === 'website') return 'Website'
  return platform || 'external'
}

function parseSocialLinks(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}
