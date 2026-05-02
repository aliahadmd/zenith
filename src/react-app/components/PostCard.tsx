import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Heart, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { likePost, postKeys, type FeedPost, unlikePost, votePoll } from '../lib/posts'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Card, CardContent, CardFooter, CardHeader } from './ui/card'

type PostCardProps = {
  post: FeedPost
  showReplyAction?: boolean
}

export function PostCard({ post, showReplyAction = true }: PostCardProps) {
  const queryClient = useQueryClient()
  const formattedDate = post.createdAt
    ? new Date(post.createdAt * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  const likeMutation = useMutation({
    mutationFn: () => post.viewerLiked ? unlikePost(post.id) : likePost(post.id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(post.author.username, post.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  const voteMutation = useMutation({
    mutationFn: (optionId: string) => {
      if (!post.poll) throw new Error('Poll not found')
      return votePoll(post.poll.id, optionId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(post.author.username, post.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to vote.'),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              to="/u/$username/post/$slug"
              params={{ username: post.author.username, slug: post.slug }}
              className="truncate font-semibold leading-tight hover:underline"
            >
              {post.author.displayName}
            </Link>
            <p className="text-sm text-muted-foreground">@{post.author.username}</p>
          </div>
          <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {post.body && <p className="whitespace-pre-wrap text-sm leading-6">{post.body}</p>}

        {post.attachments.length > 0 && (
          <div className={cn('grid gap-2', post.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {post.attachments.map((attachment) => (
              <img
                key={attachment.id}
                src={attachment.url}
                alt={attachment.fileName}
                className="aspect-video w-full rounded-md border object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {post.poll && (
          <div className="rounded-md border p-4">
            <p className="font-medium">{post.poll.question}</p>
            <div className="mt-3 flex flex-col gap-2">
              {post.poll.options.map((option) => {
                const percent = post.poll && post.poll.totalVotes > 0
                  ? Math.round((option.voteCount / post.poll.totalVotes) * 100)
                  : 0
                const selected = post.poll?.viewerOptionId === option.id
                const showResults = Boolean(post.poll?.viewerOptionId)

                return (
                  <Button
                    key={option.id}
                    type="button"
                    variant={selected ? 'secondary' : 'outline'}
                    className="relative min-h-10 justify-between overflow-hidden"
                    disabled={voteMutation.isPending}
                    onClick={() => voteMutation.mutate(option.id)}
                  >
                    {showResults && (
                      <span
                        className="absolute inset-y-0 left-0 bg-accent"
                        style={{ width: `${percent}%` }}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10 truncate">{option.text}</span>
                    {showResults && <span className="relative z-10 text-muted-foreground">{percent}%</span>}
                  </Button>
                )
              })}
            </div>
            {post.poll.viewerOptionId && (
              <p className="mt-2 text-xs text-muted-foreground">{post.poll.totalVotes} votes</p>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2 pt-0">
        <Button
          type="button"
          variant={post.viewerLiked ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => likeMutation.mutate()}
          disabled={likeMutation.isPending}
        >
          <Heart data-icon="inline-start" />
          {post.likeCount}
        </Button>
        {showReplyAction && (
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/u/$username/post/$slug"
              params={{ username: post.author.username, slug: post.slug }}
              aria-label={`View replies for post by ${post.author.displayName}`}
            >
              <MessageCircle data-icon="inline-start" />
              {post.replyCount}
            </Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
