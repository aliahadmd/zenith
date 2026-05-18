import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Camera, Heart, Images, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { photographyKeys, type PhotographyAlbumSummary } from '../lib/photography'
import { likePost, postKeys, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

type PhotographyCardProps = {
  album: PhotographyAlbumSummary
  showReplyAction?: boolean
}

export function PhotographyCard({ album, showReplyAction = true }: PhotographyCardProps) {
  const queryClient = useQueryClient()
  const formattedDate = album.publishedAt || album.createdAt
    ? new Date((album.publishedAt ?? album.createdAt ?? 0) * 1000).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : ''

  const likeMutation = useMutation({
    mutationFn: () => album.viewerLiked ? unlikePost(album.postId) : likePost(album.postId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: photographyKeys.profile(album.author.username) }),
        queryClient.invalidateQueries({ queryKey: photographyKeys.album(album.author.username, album.slug) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  return (
    <article className="border-b bg-background px-5 py-4 transition-colors hover:bg-card/40">
      <div className="flex gap-3">
        <Avatar className="mt-0.5 size-10">
          <AvatarImage src={album.author.avatarUrl ?? undefined} alt={album.author.displayName} />
          <AvatarFallback className="text-sm font-semibold">
            {album.author.displayName.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link
                  to="/u/$username/photography/$slug"
                  params={{ username: album.author.username, slug: album.slug }}
                  className="truncate text-[15px] font-semibold leading-tight hover:underline"
                >
                  {album.author.displayName}
                </Link>
                <span className="text-sm text-muted-foreground">@{album.author.username}</span>
              </div>
            </div>
            <time className="shrink-0 text-xs text-muted-foreground">{formattedDate}</time>
          </div>

          <Link
            to="/u/$username/photography/$slug"
            params={{ username: album.author.username, slug: album.slug }}
            className="mt-3 block overflow-hidden rounded-xl border bg-card/30 transition-colors hover:bg-card/60"
          >
            <PhotoMosaic album={album} />
            <div className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="w-fit normal-case tracking-normal">
                  <Camera data-icon="inline-start" />
                  Photography
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Images className="size-3.5" aria-hidden="true" />
                  {album.photoCount} {album.photoCount === 1 ? 'photo' : 'photos'}
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold leading-snug">{album.title}</h2>
                {album.description && (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                    {album.description}
                  </p>
                )}
              </div>
            </div>
          </Link>

          <div className="mt-3 flex flex-wrap items-center gap-1 text-muted-foreground">
            <Button
              type="button"
              variant={album.viewerLiked ? 'secondary' : 'ghost'}
              size="sm"
              className={cn('rounded-full px-2.5', album.viewerLiked && 'text-primary')}
              onClick={() => likeMutation.mutate()}
              disabled={likeMutation.isPending}
            >
              <Heart data-icon="inline-start" />
              {album.likeCount}
            </Button>
            {showReplyAction && (
              <Button asChild variant="ghost" size="sm" className="rounded-full px-2.5">
                <Link
                  to="/u/$username/photography/$slug"
                  params={{ username: album.author.username, slug: album.slug }}
                  aria-label={`View replies for photography album by ${album.author.displayName}`}
                >
                  <MessageCircle data-icon="inline-start" />
                  {album.replyCount}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

function PhotoMosaic({ album }: { album: PhotographyAlbumSummary }) {
  const photos = album.photos.slice(0, 4)
  if (photos.length === 0) {
    return (
      <div className="flex aspect-[16/9] w-full items-center justify-center border-b bg-muted text-muted-foreground">
        <Camera aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className={cn(
      'grid aspect-[16/9] w-full overflow-hidden border-b bg-muted',
      photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2',
    )}>
      {photos.map((photo, index) => (
        <img
          key={photo.id}
          src={photo.previewUrl}
          alt={photo.altText || photo.title || album.title}
          className={cn(
            'size-full object-cover',
            photos.length > 2 && index === 0 && 'row-span-2',
          )}
          loading="lazy"
        />
      ))}
    </div>
  )
}
