import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { FileText, Heart, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { likePost, postKeys, type FeedPost, unlikePost, votePoll } from '../lib/posts'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ReportDialog } from './ReportDialog'

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
        queryClient.invalidateQueries({ queryKey: postKeys.creator(post.author.username) }),
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
        queryClient.invalidateQueries({ queryKey: postKeys.creator(post.author.username) }),
        queryClient.invalidateQueries({ queryKey: postKeys.detail(post.author.username, post.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to vote.'),
  })

  return (
    <article className="border-b bg-background px-5 py-4 transition-colors hover:bg-card/40">
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={post.author.avatarUrl ?? undefined} alt={post.author.displayName} />
          <AvatarFallback className="text-sm font-semibold">
            {post.author.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link
                  to="/u/$username/post/$slug"
                  params={{ username: post.author.username, slug: post.slug }}
                  className="truncate text-[15px] font-semibold leading-tight hover:underline"
                >
                  {post.author.displayName}
                </Link>
                <span className="text-sm text-muted-foreground">@{post.author.username}</span>
                <Badge variant="secondary" className="normal-case tracking-normal">
                  <FileText data-icon="inline-start" />
                  Post
                </Badge>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>

          <div className="mt-3 flex flex-col gap-4">
            {post.body && <p className="whitespace-pre-wrap text-[15px] leading-6">{post.body}</p>}

            {post.attachments.length > 0 && (
              <div className={cn('grid overflow-hidden rounded-lg border', post.attachments.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
                {post.attachments.map((attachment) => (
                  <img
                    key={attachment.id}
                    src={attachment.url}
                    alt={attachment.fileName}
                    className="aspect-video w-full border-border object-cover not-last:border-r"
                    loading="lazy"
                  />
                ))}
              </div>
            )}

            {post.poll && (
              <div className="rounded-lg border bg-card/40 p-4">
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
                        className={cn(
                          'relative min-h-10 justify-between overflow-hidden rounded-md',
                          selected && 'text-primary',
                        )}
                        disabled={voteMutation.isPending}
                        onClick={() => voteMutation.mutate(option.id)}
                      >
                        {showResults && (
                          <span
                            className="absolute inset-y-0 left-0 bg-primary/15"
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
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
            <Button
              type="button"
              variant={post.viewerLiked ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('rounded-full px-2.5', post.viewerLiked && 'text-primary')}
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
            >
              <Heart data-icon="inline-start" />
              {post.likeCount}
            </Button>
            {showReplyAction && (
              <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
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
            <ReportDialog targetType="post" targetId={post.id} />
          </div>
        </div>
      </div>
    </article>
  )
}
