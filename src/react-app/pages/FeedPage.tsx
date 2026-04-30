import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
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
  const [posts, setPosts] = useState<Post[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    apiGet<FeedResponse>('/api/feed').then(({ data }) => {
      if (data) {
        setPosts(data.posts)
        setMessage(data.message ?? null)
      }
      setIsLoading(false)
    })
  }, [])

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">{message ?? 'You have not followed yet'}</p>
        <p className="text-sm">Follow some creators to see their posts here.</p>
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
