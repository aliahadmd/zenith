import { Card, CardContent, CardHeader } from './ui/card'

type Post = {
  id: string
  body: string
  createdAt: number | null
  author: {
    displayName: string
    username: string
  }
}

export function PostCard({ post }: { post: Post }) {
  const formattedDate = post.createdAt
    ? new Date(post.createdAt * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{post.author.displayName}</p>
            <p className="text-sm text-muted-foreground">@{post.author.username}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6">{post.body}</p>
      </CardContent>
    </Card>
  )
}
