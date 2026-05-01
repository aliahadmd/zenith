import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ExternalLink, Globe } from 'lucide-react'
import { FaLinkedin } from 'react-icons/fa6'
import { SiGithub, SiInstagram, SiX, SiYoutube } from 'react-icons/si'
import { useAuth } from '../context/AuthContext'
import { apiGetRequired } from '../lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { LoadingBlock } from '../components/LoadingBlock'

type ProfileData = {
  id: string
  displayName: string
  username: string
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
    </div>
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
