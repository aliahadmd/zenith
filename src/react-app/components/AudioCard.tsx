import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Headphones, Heart, MessageCircle, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useAudioPlayer } from '../context/AudioPlayerContext'
import { audioKeys, formatAudioDuration, type AudioItemSummary } from '../lib/audio'
import { likePost, postKeys, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { ReportDialog } from './ReportDialog'
import { SaveButton } from './SaveButton'

type AudioCardProps = {
  item: AudioItemSummary
  queue?: AudioItemSummary[]
  showReplyAction?: boolean
}

export function AudioCard({ item, queue, showReplyAction = true }: AudioCardProps) {
  const queryClient = useQueryClient()
  const player = useAudioPlayer()
  const formattedDate = item.publishedAt || item.createdAt
    ? new Date((item.publishedAt ?? item.createdAt ?? 0) * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''
  const active = player.currentItem?.id === item.id

  const likeMutation = useMutation({
    mutationFn: () => item.viewerLiked ? unlikePost(item.postId) : likePost(item.postId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: audioKeys.profile(item.author.username) }),
        queryClient.invalidateQueries({ queryKey: audioKeys.item(item.author.username, item.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  const collectionRoute = item.collection.kind === 'album' ? '/u/$username/album/$slug' : '/u/$username/podcast/$slug'

  return (
    <article className="border-b bg-background px-5 py-4 transition-colors hover:bg-card/40">
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={item.author.avatarUrl ?? undefined} alt={item.author.displayName} />
          <AvatarFallback className="text-sm font-semibold">
            {item.author.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link
                  to="/u/$username/audio/$slug"
                  params={{ username: item.author.username, slug: item.slug }}
                  className="truncate text-[15px] font-semibold leading-tight hover:underline"
                >
                  {item.author.displayName}
                </Link>
                <span className="text-sm text-muted-foreground">@{item.author.username}</span>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border bg-card/30">
            <div className="flex flex-col sm:flex-row">
              <button
                type="button"
                className="group relative aspect-square w-full shrink-0 overflow-hidden bg-muted text-left sm:w-44"
                onClick={() => item.streamUrl && player.playItem(item, queue)}
                disabled={!item.streamUrl}
                aria-label={`Play ${item.title}`}
              >
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <Headphones aria-hidden="true" />
                  </div>
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <span className="flex size-12 items-center justify-center rounded-full bg-background/85 text-foreground shadow">
                    <Play aria-hidden="true" />
                  </span>
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="w-fit normal-case tracking-normal">
                    <Headphones data-icon="inline-start" />
                    {item.kind === 'music' ? 'Music' : 'Episode'}
                  </Badge>
                  {active && <Badge variant="outline" className="normal-case tracking-normal">Playing</Badge>}
                  <span className="text-xs text-muted-foreground">{formatAudioDuration(item.durationSeconds)}</span>
                </div>
                <div>
                  <Link
                    to="/u/$username/audio/$slug"
                    params={{ username: item.author.username, slug: item.slug }}
                    className="text-lg font-semibold leading-snug hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From{' '}
                    <Link
                      to={collectionRoute}
                      params={{ username: item.author.username, slug: item.collection.slug }}
                      className="text-foreground hover:underline"
                    >
                      {item.collection.title}
                    </Link>
                  </p>
                  {item.description && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
            <Button
              type="button"
              variant={item.viewerLiked ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('rounded-full px-2.5', item.viewerLiked && 'text-primary')}
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
            >
              <Heart data-icon="inline-start" />
              {item.likeCount}
            </Button>
            {showReplyAction && (
              <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
                <Link
                  to="/u/$username/audio/$slug"
                  params={{ username: item.author.username, slug: item.slug }}
                  aria-label={`View replies for audio by ${item.author.displayName}`}
                >
                  <MessageCircle data-icon="inline-start" />
                  {item.replyCount}
                </Link>
              </Button>
            )}
            <SaveButton
              postId={item.postId}
              saved={item.viewerSaved}
              queryKeys={[audioKeys.profile(item.author.username), audioKeys.item(item.author.username, item.slug)]}
            />
            <ReportDialog targetType="post" targetId={item.postId} />
          </div>
        </div>
      </div>
    </article>
  )
}
