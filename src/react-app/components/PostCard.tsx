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
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">{post.author.displayName}</p>
            <p className="text-sm text-muted-foreground">@{post.author.username}</p>
          </div>
          <time className="text-xs text-muted-foreground">{formattedDate}</time>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed">{post.body}</p>
      </CardContent>
    </Card>
  )
}
