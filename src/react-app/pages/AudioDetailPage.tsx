import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Headphones, Heart, Play } from 'lucide-react'
import { toast } from 'sonner'
import { useAudioPlayer } from '../context/AudioPlayerContext'
import { audioItemDetailQueryOptions, audioKeys, formatAudioDuration } from '../lib/audio'
import { likePost, postKeys, type FeedPost, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { LoadingBlock } from '../components/LoadingBlock'
import { Discussion } from '../components/Discussion'
import { SaveButton } from '../components/SaveButton'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

export function AudioDetailPage({ username, slug }: { username: string; slug: string }) {
  const queryClient = useQueryClient()
  const player = useAudioPlayer()
  const detailQuery = useQuery(audioItemDetailQueryOptions(username, slug))
  const likeMutation = useMutation({
    mutationFn: () => {
      const item = detailQuery.data?.item
      if (!item) throw new Error('Audio not loaded')
      return item.viewerLiked ? unlikePost(item.postId) : likePost(item.postId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: audioKeys.item(username, slug) }),
        queryClient.invalidateQueries({ queryKey: audioKeys.profile(username) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  if (detailQuery.isPending) return <LoadingBlock label="Loading audio" />
  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load audio</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const { item, replies } = detailQuery.data
  const detailKey = audioKeys.item(username, slug)
  const replyPost: FeedPost = {
    id: item.postId,
    type: 'post',
    slug: item.slug,
    body: item.title,
    createdAt: item.publishedAt ?? item.createdAt,
    author: item.author,
    attachments: [],
    likeCount: item.likeCount,
    replyCount: item.replyCount,
    viewerLiked: item.viewerLiked,
    viewerSaved: item.viewerSaved,
    poll: null,
  }
  const collectionRoute = item.collection.kind === 'album' ? '/u/$username/album/$slug' : '/u/$username/podcast/$slug'

  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Audio</h1>
        </div>
      </header>

      <article className="border-b px-5 py-6">
        <div className="mb-5 flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={item.author.avatarUrl ?? undefined} alt={item.author.displayName} />
            <AvatarFallback>{item.author.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight">{item.author.displayName}</p>
              <span className="text-sm text-muted-foreground">@{item.author.username}</span>
              <Badge variant="secondary" className="normal-case tracking-normal">
                {item.kind === 'music' ? 'Music' : 'Episode'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {item.publishedAt
                ? new Date(item.publishedAt * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'Draft'}
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-card/30">
          <div className="relative aspect-square w-full overflow-hidden bg-muted sm:aspect-[16/8]">
            {item.coverUrl ? (
              <img src={item.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Headphones aria-hidden="true" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
            <Button
              type="button"
              className="absolute bottom-4 left-4 rounded-full"
              disabled={!item.streamUrl}
              onClick={() => player.playItem(item, [item])}
            >
              <Play data-icon="inline-start" />
              Play
            </Button>
          </div>
          <div className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="normal-case tracking-normal">
                <Headphones data-icon="inline-start" />
                Audio
              </Badge>
              <span className="text-sm text-muted-foreground">{formatAudioDuration(item.durationSeconds)}</span>
            </div>
            <h1 className="text-3xl font-semibold leading-tight">{item.title}</h1>
            <p className="text-sm text-muted-foreground">
              From{' '}
              <Link
                to={collectionRoute}
                params={{ username: item.author.username, slug: item.collection.slug }}
                className="text-foreground hover:underline"
              >
                {item.collection.title}
              </Link>
            </p>
            {item.description && <p className="text-[15px] leading-7 text-muted-foreground">{item.description}</p>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1 text-muted-foreground">
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
          <SaveButton postId={item.postId} saved={item.viewerSaved} queryKeys={[detailKey, audioKeys.profile(username)]} />
        </div>
      </article>

      <Discussion post={replyPost} comments={replies} detailKey={detailKey} />
    </div>
  )
}
