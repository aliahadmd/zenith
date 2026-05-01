import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useAuth } from '../context/AuthContext'
import { apiGetRequired } from '../lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Card, CardContent } from '../components/ui/card'

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
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
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
  const socialLinks = parseSocialLinks(profile.socialLinks)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.displayName} />
          <AvatarFallback className="text-2xl">
            {profile.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{profile.displayName}</h1>
          <p className="text-muted-foreground">@{profile.username}</p>
          {profile.tagline && (
            <p className="mt-2 text-sm">{profile.tagline}</p>
          )}
          {Object.keys(socialLinks).length > 0 && (
            <div className="mt-2 flex gap-3">
              {Object.entries(socialLinks).map(([platform, url]) => (
                <a
                  key={platform}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {platform}
                </a>
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
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">
                {profile.tagline ?? 'No bio yet.'}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="subscribed" className="mt-4 space-y-3">
          {subscriptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not subscribed to any creators yet.</p>
          ) : (
            subscriptions.map((sub) => (
              <Link
                to="/u/$username"
                params={{ username: sub.username }}
                key={sub.username}
                className="flex items-center gap-3"
              >
                <Avatar>
                  <AvatarImage src={sub.avatarUrl ?? undefined} alt={sub.displayName} />
                  <AvatarFallback>{sub.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{sub.displayName}</p>
                  <p className="text-sm text-muted-foreground">@{sub.username}</p>
                </div>
              </Link>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function parseSocialLinks(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}
