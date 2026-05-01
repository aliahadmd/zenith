import { useQuery } from '@tanstack/react-query'
import { apiGetRequired } from '../lib/api'
import { PostCard } from '../components/PostCard'

type Post = {
  id: string
  body: string
  createdAt: number | null
  author: {
    displayName: string
    username: string
  }
}

type FeedResponse = {
  posts: Post[]
  message?: string
}

export function FeedPage() {
  const feedQuery = useQuery({
    queryKey: ['feed'],
    queryFn: () => apiGetRequired<FeedResponse>('/api/feed'),
  })

  if (feedQuery.isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (feedQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load feed</p>
        <p className="text-sm">{feedQuery.error.message}</p>
      </div>
    )
  }

  const posts = feedQuery.data.posts
  const message = feedQuery.data.message

  if (posts.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">{message ?? "You haven't subscribed to any creators yet"}</p>
        <p className="text-sm">Subscribe to creators to see their posts here.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Your Feed</h1>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
