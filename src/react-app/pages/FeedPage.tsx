import { useQuery } from '@tanstack/react-query'
import { ArticleCard } from '../components/ArticleCard'
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
      <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-2 border-x px-6 text-center text-muted-foreground">
        <p className="text-lg font-medium">Unable to load feed</p>
        <p className="text-sm">{feedQuery.error.message}</p>
      </div>
    )
  }

  const items = feedQuery.data.items ?? feedQuery.data.posts
  const message = feedQuery.data.message

  if (items.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[640px] flex-col items-center justify-center gap-2 border-x px-6 text-center text-muted-foreground">
        <p className="text-lg font-medium">{message ?? "You haven't subscribed to any creators yet"}</p>
        <p className="text-sm">Subscribe to creators to see their posts here.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[640px] flex-col border-x">
      <div className="sticky top-0 z-10 border-b bg-background/90 px-5 py-4 backdrop-blur lg:top-0">
        <h1 className="text-xl font-semibold leading-tight">Your Feed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Latest posts from creators you follow.</p>
      </div>
      <div className="flex flex-col">
        {items.map((item) => (
          item.type === 'article'
            ? <ArticleCard key={`article-${item.id}`} article={item} />
            : <PostCard key={`post-${item.id}`} post={item} />
        ))}
      </div>
    </div>
  )
}
