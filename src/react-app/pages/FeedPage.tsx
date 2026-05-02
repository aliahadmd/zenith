import { useQuery } from '@tanstack/react-query'
import { PostCard } from '../components/PostCard'
import { LoadingBlock } from '../components/LoadingBlock'
import { feedQueryOptions } from '../lib/posts'

export function FeedPage() {
  const feedQuery = useQuery(feedQueryOptions())

  if (feedQuery.isPending) {
    return <LoadingBlock label="Loading feed" />
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
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Your Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Latest posts from creators you follow.</p>
      </div>
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  )
}
