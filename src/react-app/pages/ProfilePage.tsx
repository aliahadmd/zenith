import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Globe, Loader2 } from 'lucide-react'
import { FaLinkedin } from 'react-icons/fa6'
import { SiGithub, SiInstagram, SiX, SiYoutube } from 'react-icons/si'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { apiGetRequired } from '../lib/api'
import { postKeys, type FeedPost } from '../lib/posts'
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
import { PostCard } from '../components/PostCard'

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

type CreatorSubscriber = {
  displayName: string
  username: string
  avatarUrl: string | null
  status: 'active' | 'trialing'
  accessType: 'free' | 'trial' | 'paid'
  trialEndsAt: number | null
  createdAt: number | null
}

type CreatorSubscribersResponse = {
  subscribers: CreatorSubscriber[]
}

type CreatorPostsResponse = {
  posts: FeedPost[]
  hasAccess: boolean
}

export function ProfilePage({ username }: { username: string }) {
  const { currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [pendingFreeKind, setPendingFreeKind] = useState<'free' | 'trial' | null>(null)

  const isOwnProfile = currentUser?.username === username
  const defaultTab = isOwnProfile && currentUser?.role === 'creator'
    ? 'posts'
    : isOwnProfile
      ? 'subscribed'
      : 'about'

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => apiGetRequired<ProfileData>(`/api/profile/${username}`),
  })
  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', username],
    queryFn: () => apiGetRequired<SubscriptionsResponse>(`/api/profile/${username}/subscriptions`),
  })
  const isCreatorProfile = profileQuery.data?.role === 'creator'
  const creatorPostsQuery = useQuery({
    queryKey: postKeys.creator(username),
    queryFn: () => apiGetRequired<CreatorPostsResponse>(`/api/profile/${username}/posts`),
    enabled: Boolean(isCreatorProfile),
  })
  const creatorSubscribersQuery = useQuery({
    queryKey: ['profile', username, 'subscribers'],
    queryFn: () => apiGetRequired<CreatorSubscribersResponse>(`/api/profile/${username}/subscribers`),
    enabled: Boolean(isCreatorProfile),
  })
  const subscriptionOptionsQuery = useQuery(subscriptionOptionsQueryOptions(
    username,
    Boolean(isCreatorProfile && !isOwnProfile),
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
  const showMembershipCard = profile.role === 'creator' && !isOwnProfile
  const renderMembershipCard = () => showMembershipCard ? (
    <SubscriptionOptionsCard
      options={subscriptionOptionsQuery.data}
      isLoading={subscriptionOptionsQuery.isPending}
      error={subscriptionOptionsQuery.isError ? subscriptionOptionsQuery.error.message : null}
      onChooseFree={setPendingFreeKind}
      onChoosePaid={(interval) => checkoutMutation.mutate({ creatorId: profile.id, interval })}
      isStartingCheckout={checkoutMutation.isPending}
    />
  ) : null

  return (
    <div className={showMembershipCard
      ? 'mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[minmax(0,640px)_20rem] xl:grid-cols-[minmax(0,640px)_22rem]'
      : 'mx-auto w-full max-w-[640px]'
    }>
      <div className="min-w-0 border-x">
        {/* Profile header */}
        <div className="flex flex-col gap-4 border-b bg-background p-5 sm:flex-row sm:items-start">
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
          </div>
        </div>

        {showMembershipCard && (
          <div className="border-b p-4 lg:hidden">
            {renderMembershipCard()}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue={defaultTab}>
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start rounded-none border-b px-4 py-0">
            <TabsTrigger value="about">About</TabsTrigger>
            {profile.role === 'creator' && <TabsTrigger value="posts">Posts</TabsTrigger>}
            {profile.role === 'creator' && <TabsTrigger value="subscribers">Subscribers</TabsTrigger>}
            <TabsTrigger value="subscribed">Subscribed to</TabsTrigger>
          </TabsList>
          <TabsContent value="about">
            <section className="border-b p-5">
              <div className="flex flex-col gap-5">
                <div>
                  <h2 className="text-base font-semibold">About</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Profile details and social links.</p>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  {profile.tagline ?? 'No bio yet.'}
                </p>
                {socialLinks.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {socialLinks.map(([platform, url]) => (
                      <SocialLinkIcon key={platform} platform={platform} url={url} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          </TabsContent>
          <TabsContent value="subscribed">
            {subscriptions.length === 0 ? (
              <div className="border-b p-5">
                <p className="text-sm text-muted-foreground">Not subscribed to any creators yet.</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {subscriptions.map((sub) => (
                  <Link
                    to="/u/$username"
                    params={{ username: sub.username }}
                    key={sub.username}
                    className="flex min-h-16 items-center gap-3 border-b px-5 py-3 transition-colors hover:bg-card/40"
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
          {profile.role === 'creator' && (
            <TabsContent value="posts">
              <CreatorPostsTab
                posts={creatorPostsQuery.data?.posts ?? []}
                hasAccess={creatorPostsQuery.data?.hasAccess}
                isLoading={creatorPostsQuery.isPending}
                error={creatorPostsQuery.isError ? creatorPostsQuery.error.message : null}
                isOwnProfile={isOwnProfile}
              />
            </TabsContent>
          )}
          {profile.role === 'creator' && (
            <TabsContent value="subscribers">
              <CreatorSubscribersTab
                subscribers={creatorSubscribersQuery.data?.subscribers ?? []}
                isLoading={creatorSubscribersQuery.isPending}
                error={creatorSubscribersQuery.isError ? creatorSubscribersQuery.error.message : null}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>

      {showMembershipCard && (
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-6">
            {renderMembershipCard()}
          </div>
        </aside>
      )}

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

function CreatorPostsTab({
  posts,
  hasAccess,
  isLoading,
  error,
  isOwnProfile,
}: {
  posts: FeedPost[]
  hasAccess: boolean | undefined
  isLoading: boolean
  error: string | null
  isOwnProfile: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="border-b p-5">
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
        <div className="border-b p-5">
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (hasAccess === false) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          Subscribe to this creator to see member posts.
        </p>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          {isOwnProfile ? 'You have not published any posts yet.' : 'No posts published yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

function CreatorSubscribersTab({
  subscribers,
  isLoading,
  error,
}: {
  subscribers: CreatorSubscriber[]
  isLoading: boolean
  error: string | null
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="border-b p-5">
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
        <div className="border-b p-5">
          <Skeleton className="h-12 w-full rounded-md" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    )
  }

  if (subscribers.length === 0) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">No active subscribers yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {subscribers.map((subscriber) => (
        <Link
          to="/u/$username"
          params={{ username: subscriber.username }}
          key={subscriber.username}
          className="flex min-h-16 items-center gap-3 border-b px-5 py-3 transition-colors hover:bg-card/40"
        >
          <Avatar>
            <AvatarImage src={subscriber.avatarUrl ?? undefined} alt={subscriber.displayName} />
            <AvatarFallback>{subscriber.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{subscriber.displayName}</p>
            <p className="text-sm text-muted-foreground">@{subscriber.username}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="secondary" className="normal-case tracking-normal">
              {subscriber.accessType}
            </Badge>
            {subscriber.trialEndsAt && (
              <span className="hidden text-xs text-muted-foreground sm:inline">
                Ends {formatUnixDate(subscriber.trialEndsAt)}
              </span>
            )}
          </div>
        </Link>
      ))}
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

        <div className="grid gap-3 xl:grid-cols-2">
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
          <div className="grid gap-3 xl:grid-cols-2">
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
