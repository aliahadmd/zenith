import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { apiGet } from '../lib/api'
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

export function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { currentUser } = useAuth()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const isOwnProfile = currentUser?.username === username
  const defaultTab = isOwnProfile ? 'subscribed' : 'about'

  useEffect(() => {
    if (!username) return
    Promise.all([
      apiGet<ProfileData>(`/api/profile/${username}`),
      apiGet<SubscriptionsResponse>(`/api/profile/${username}/subscriptions`),
    ]).then(([profileRes, subsRes]) => {
      if (profileRes.data) setProfile(profileRes.data)
      if (subsRes.data) setSubscriptions(subsRes.data.subscriptions)
      setIsLoading(false)
    })
  }, [username])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <p>User not found.</p>
      </div>
    )
  }

  const socialLinks = profile.socialLinks ? JSON.parse(profile.socialLinks) as Record<string, string> : {}

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
              <Link to={`/u/${sub.username}`} key={sub.username} className="flex items-center gap-3">
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
