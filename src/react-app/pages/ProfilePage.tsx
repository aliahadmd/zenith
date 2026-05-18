import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Globe, Loader2, MoreHorizontal } from 'lucide-react'
import { FaLinkedin } from 'react-icons/fa6'
import { SiGithub, SiInstagram, SiX, SiYoutube } from 'react-icons/si'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { apiGetRequired } from '../lib/api'
import { articleKeys, type ArticleSummary, type CreatorArticlesResponse } from '../lib/articles'
import { audioKeys, creatorAudioQueryOptions, type AudioCollectionSummary, type CreatorAudioResponse } from '../lib/audio'
import { creatorPhotographyQueryOptions, photographyKeys, type CreatorPhotographyResponse } from '../lib/photography'
import { postKeys, type FeedPost } from '../lib/posts'
import { cn } from '../lib/utils'
import { defaultProfileTabs, type ProfileTabKey, type ProfileTabSetting } from '../lib/profile-tabs'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
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
import { ArticleCard } from '../components/ArticleCard'
import { AudioCard } from '../components/AudioCard'
import { AudioCollectionCard } from '../components/AudioCollectionCard'
import { PhotographyCard } from '../components/PhotographyCard'
import { PostCard } from '../components/PostCard'

type ProfileData = {
  id: string
  displayName: string
  username: string
  role: 'subscriber' | 'creator'
  tagline: string | null
  avatarUrl: string | null
  socialLinks: string | null
  profileTabs: ProfileTabSetting[] | null
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
  const initialTab = isOwnProfile && currentUser?.role === 'creator'
    ? 'posts'
    : isOwnProfile
      ? 'subscribed'
      : 'about'
  const [activeSelection, setActiveSelection] = useState<{ username: string; tab: ProfileTabKey }>({
    username,
    tab: initialTab,
  })
  const requestedActiveTab = activeSelection.username === username ? activeSelection.tab : initialTab

  const profileQuery = useQuery({
    queryKey: ['profile', username],
    queryFn: () => apiGetRequired<ProfileData>(`/api/profile/${username}`),
  })
  const resolvedTabs = resolveProfileTabs(profileQuery.data)
  const visibleTabs = resolvedTabs.filter((tab) => tab.visible)
  const isTabVisible = (tabKey: ProfileTabKey) => visibleTabs.some((tab) => tab.key === tabKey)
  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', username],
    queryFn: () => apiGetRequired<SubscriptionsResponse>(`/api/profile/${username}/subscriptions`),
    enabled: Boolean(profileQuery.data && isTabVisible('subscribed')),
  })
  const isCreatorProfile = profileQuery.data?.role === 'creator'
  const creatorPostsQuery = useQuery({
    queryKey: postKeys.creator(username),
    queryFn: () => apiGetRequired<CreatorPostsResponse>(`/api/profile/${username}/posts`),
    enabled: Boolean(isCreatorProfile && isTabVisible('posts')),
  })
  const creatorArticlesQuery = useQuery({
    queryKey: articleKeys.creator(username),
    queryFn: () => apiGetRequired<CreatorArticlesResponse>(`/api/profile/${username}/articles`),
    enabled: Boolean(isCreatorProfile && isTabVisible('articles')),
  })
  const creatorPhotographyQuery = useQuery(creatorPhotographyQueryOptions(
    username,
    Boolean(isCreatorProfile && isTabVisible('photography')),
  ))
  const creatorAudioQuery = useQuery(creatorAudioQueryOptions(
    username,
    Boolean(isCreatorProfile && isTabVisible('audio')),
  ))
  const creatorSubscribersQuery = useQuery({
    queryKey: ['profile', username, 'subscribers'],
    queryFn: () => apiGetRequired<CreatorSubscribersResponse>(`/api/profile/${username}/subscribers`),
    enabled: Boolean(isCreatorProfile && isTabVisible('subscribers')),
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
                queryClient.invalidateQueries({ queryKey: photographyKeys.profile(username) }),
                queryClient.invalidateQueries({ queryKey: audioKeys.profile(username) }),
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

  if (profileQuery.isPending) {
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
  const currentActiveTab = isTabVisible(requestedActiveTab)
    ? requestedActiveTab
    : getPreferredProfileTab({ tabs: visibleTabs, isOwnProfile, role: profile.role })
  const subscriptions = subscriptionsQuery.data?.subscriptions ?? []
  const primaryTabs = visibleTabs.slice(0, 4)
  const overflowTabs = visibleTabs.slice(4)
  const activeOverflowTab = overflowTabs.find((tab) => tab.key === currentActiveTab)
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
        <Tabs
          value={currentActiveTab}
          onValueChange={(value) => setActiveSelection({ username, tab: value as ProfileTabKey })}
        >
          <TabsList variant="line" className="h-auto w-full flex-wrap justify-start rounded-none border-b px-4 py-0">
            {primaryTabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
            ))}
            {overflowTabs.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-10 rounded-none border-b-2 border-transparent px-3 text-muted-foreground normal-case tracking-normal hover:text-foreground',
                      activeOverflowTab && 'border-primary text-foreground',
                    )}
                  >
                    {activeOverflowTab?.label ?? 'More'}
                    <MoreHorizontal data-icon="inline-end" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuGroup>
                    {overflowTabs.map((tab) => (
                      <DropdownMenuItem
                        key={tab.key}
                        onSelect={() => setActiveSelection({ username, tab: tab.key })}
                      >
                        {tab.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </TabsList>
          {isTabVisible('about') && (
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
          )}
          {isTabVisible('subscribed') && (
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
          )}
          {profile.role === 'creator' && isTabVisible('posts') && (
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
          {profile.role === 'creator' && isTabVisible('articles') && (
            <TabsContent value="articles">
              <CreatorArticlesTab
                articles={creatorArticlesQuery.data?.articles ?? []}
                hasAccess={creatorArticlesQuery.data?.hasAccess}
                isLoading={creatorArticlesQuery.isPending}
                error={creatorArticlesQuery.isError ? creatorArticlesQuery.error.message : null}
                isOwnProfile={isOwnProfile}
              />
            </TabsContent>
          )}
          {profile.role === 'creator' && isTabVisible('photography') && (
            <TabsContent value="photography">
              <CreatorPhotographyTab
                photography={creatorPhotographyQuery.data}
                isLoading={creatorPhotographyQuery.isPending}
                error={creatorPhotographyQuery.isError ? creatorPhotographyQuery.error.message : null}
                isOwnProfile={isOwnProfile}
              />
            </TabsContent>
          )}
          {profile.role === 'creator' && isTabVisible('audio') && (
            <TabsContent value="audio">
              <CreatorAudioTab
                audio={creatorAudioQuery.data}
                isLoading={creatorAudioQuery.isPending}
                error={creatorAudioQuery.isError ? creatorAudioQuery.error.message : null}
                isOwnProfile={isOwnProfile}
              />
            </TabsContent>
          )}
          {profile.role === 'creator' && isTabVisible('subscribers') && (
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

function resolveProfileTabs(profile: ProfileData | undefined): ProfileTabSetting[] {
  if (!profile) return defaultProfileTabs()
  if (profile.role !== 'creator') {
    return defaultProfileTabs().filter((tab) => tab.key === 'about' || tab.key === 'subscribed')
  }
  return profile.profileTabs ?? defaultProfileTabs()
}

function getPreferredProfileTab({
  tabs,
  isOwnProfile,
  role,
}: {
  tabs: ProfileTabSetting[]
  isOwnProfile: boolean
  role: ProfileData['role']
}): ProfileTabKey {
  const keys = tabs.map((tab) => tab.key)
  if (isOwnProfile && role === 'creator' && keys.includes('posts')) return 'posts'
  if (isOwnProfile && keys.includes('subscribed')) return 'subscribed'
  if (keys.includes('about')) return 'about'
  return keys[0] ?? 'about'
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

function CreatorArticlesTab({
  articles,
  hasAccess,
  isLoading,
  error,
  isOwnProfile,
}: {
  articles: ArticleSummary[]
  hasAccess: boolean | undefined
  isLoading: boolean
  error: string | null
  isOwnProfile: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="border-b p-5">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="border-b p-5">
          <Skeleton className="h-40 w-full rounded-lg" />
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
          Subscribe to this creator to see member articles.
        </p>
      </div>
    )
  }

  if (articles.length === 0) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          {isOwnProfile ? 'You have not published any articles yet.' : 'No articles published yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  )
}

function CreatorPhotographyTab({
  photography,
  isLoading,
  error,
  isOwnProfile,
}: {
  photography: CreatorPhotographyResponse | undefined
  isLoading: boolean
  error: string | null
  isOwnProfile: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="border-b p-5">
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
        <div className="border-b p-5">
          <Skeleton className="h-40 w-full rounded-lg" />
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

  if (photography?.hasAccess === false) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          Subscribe to this creator to see member photography.
        </p>
      </div>
    )
  }

  const albums = photography?.albums ?? []
  const photos = photography?.photos ?? []
  if (albums.length === 0) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          {isOwnProfile ? 'You have not published photography albums yet.' : 'No photography albums published yet.'}
        </p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="albums" className="gap-0">
      <TabsList variant="line" className="h-auto w-full flex-wrap justify-start rounded-none border-b px-4 py-0">
        <TabsTrigger value="albums">Albums</TabsTrigger>
        <TabsTrigger value="latest">Latest Photos</TabsTrigger>
      </TabsList>
      <TabsContent value="albums">
        <div className="flex flex-col">
          {albums.map((album) => <PhotographyCard key={album.id} album={album} />)}
        </div>
      </TabsContent>
      <TabsContent value="latest">
        {photos.length === 0 ? (
          <EmptyTab label="No published photos yet." />
        ) : (
          <div className="grid grid-cols-2 gap-1 border-b p-1 sm:grid-cols-3">
            {photos.slice(0, 24).map((photo) => (
              <img
                key={photo.id}
                src={photo.previewUrl}
                alt={photo.altText || photo.title || ''}
                className="aspect-square w-full rounded-md object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

function CreatorAudioTab({
  audio,
  isLoading,
  error,
  isOwnProfile,
}: {
  audio: CreatorAudioResponse | undefined
  isLoading: boolean
  error: string | null
  isOwnProfile: boolean
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col">
        <div className="border-b p-5">
          <Skeleton className="h-44 w-full rounded-lg" />
        </div>
        <div className="border-b p-5">
          <Skeleton className="h-28 w-full rounded-lg" />
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

  if (audio?.hasAccess === false) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          Subscribe to this creator to see member audio.
        </p>
      </div>
    )
  }

  const items = audio?.items ?? []
  const albums = audio?.albums ?? []
  const episodes = audio?.episodes ?? []
  const podcasts = audio?.podcasts ?? []
  const hasAudio = items.length > 0 || albums.length > 0 || podcasts.length > 0

  if (!hasAudio) {
    return (
      <div className="border-b p-5">
        <p className="text-sm text-muted-foreground">
          {isOwnProfile ? 'You have not published audio yet.' : 'No audio published yet.'}
        </p>
      </div>
    )
  }

  return (
    <Tabs defaultValue="all" className="gap-0">
      <TabsList variant="line" className="h-auto w-full flex-wrap justify-start rounded-none border-b px-4 py-0">
        <TabsTrigger value="all">All Audio</TabsTrigger>
        <TabsTrigger value="albums">Albums</TabsTrigger>
        <TabsTrigger value="episodes">Episodes</TabsTrigger>
        <TabsTrigger value="podcasts">Podcasts</TabsTrigger>
      </TabsList>
      <TabsContent value="all">
        {items.length === 0 ? (
          <EmptyTab label="No audio published yet." />
        ) : (
          <div className="flex flex-col">
            {items.map((item) => <AudioCard key={item.id} item={item} queue={items} />)}
          </div>
        )}
      </TabsContent>
      <TabsContent value="albums">
        <CollectionList collections={albums} emptyLabel="No albums published yet." />
      </TabsContent>
      <TabsContent value="episodes">
        {episodes.length === 0 ? (
          <EmptyTab label="No podcast episodes published yet." />
        ) : (
          <div className="flex flex-col">
            {episodes.map((item) => <AudioCard key={item.id} item={item} queue={episodes} />)}
          </div>
        )}
      </TabsContent>
      <TabsContent value="podcasts">
        <CollectionList collections={podcasts} emptyLabel="No podcasts published yet." />
      </TabsContent>
    </Tabs>
  )
}

function CollectionList({
  collections,
  emptyLabel,
}: {
  collections: AudioCollectionSummary[]
  emptyLabel: string
}) {
  if (collections.length === 0) return <EmptyTab label={emptyLabel} />
  return (
    <div className="flex flex-col">
      {collections.map((collection) => (
        <AudioCollectionCard key={collection.id} collection={collection} />
      ))}
    </div>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div className="border-b p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
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
