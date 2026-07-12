import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronLeft, ChevronRight, Download, Heart, X } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingBlock } from '../components/LoadingBlock'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { photographyAlbumDetailQueryOptions, photographyKeys, type PhotographyPhotoSummary } from '../lib/photography'
import { likePost, postKeys, type FeedPost, unlikePost } from '../lib/posts'
import { cn } from '../lib/utils'
import { Discussion } from '../components/Discussion'

type PhotographyAlbumPageProps = {
  username: string
  slug: string
}

const EMPTY_PHOTOS: PhotographyPhotoSummary[] = []

export function PhotographyAlbumPage({ username, slug }: PhotographyAlbumPageProps) {
  const queryClient = useQueryClient()
  const [selectedPhoto, setSelectedPhoto] = useState<PhotographyPhotoSummary | null>(null)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const detailQuery = useQuery(photographyAlbumDetailQueryOptions(username, slug))
  const likeMutation = useMutation({
    mutationFn: () => {
      const album = detailQuery.data?.album
      if (!album) throw new Error('Album not loaded')
      return album.viewerLiked ? unlikePost(album.postId) : likePost(album.postId)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: postKeys.feed }),
        queryClient.invalidateQueries({ queryKey: photographyKeys.album(username, slug) }),
        queryClient.invalidateQueries({ queryKey: photographyKeys.profile(username) }),
      ])
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Unable to update like.'),
  })

  const photos = detailQuery.data?.photos ?? EMPTY_PHOTOS
  const selectedPhotoIndex = useMemo(
    () => (selectedPhoto ? photos.findIndex((photo) => photo.id === selectedPhoto.id) : -1),
    [photos, selectedPhoto],
  )
  const canMovePrevious = selectedPhotoIndex > 0
  const canMoveNext = selectedPhotoIndex >= 0 && selectedPhotoIndex < photos.length - 1
  const showPreviousPhoto = useCallback(() => {
    if (!canMovePrevious) return
    setSelectedPhoto(photos[selectedPhotoIndex - 1])
  }, [canMovePrevious, photos, selectedPhotoIndex])
  const showNextPhoto = useCallback(() => {
    if (!canMoveNext) return
    setSelectedPhoto(photos[selectedPhotoIndex + 1])
  }, [canMoveNext, photos, selectedPhotoIndex])

  useEffect(() => {
    if (!selectedPhoto) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        showPreviousPhoto()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        showNextPhoto()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedPhoto, showNextPhoto, showPreviousPhoto])

  const handlePhotoPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeStartRef.current = { x: event.clientX, y: event.clientY }
  }

  const handlePhotoPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return
    if (deltaX > 0) showPreviousPhoto()
    if (deltaX < 0) showNextPhoto()
  }

  if (detailQuery.isPending) return <LoadingBlock label="Loading photography album" />
  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load photography</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const { album, replies } = detailQuery.data
  const replyPost: FeedPost = {
    id: album.postId,
    type: 'post',
    slug: album.slug,
    body: album.title,
    createdAt: album.publishedAt ?? album.createdAt,
    author: album.author,
    attachments: [],
    likeCount: album.likeCount,
    replyCount: album.replyCount,
    viewerLiked: album.viewerLiked,
    poll: null,
  }
  const detailKey = photographyKeys.album(username, slug)

  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">Photography</h1>
          <p className="text-sm text-muted-foreground">
            {album.replyCount === 1 ? '1 comment' : `${album.replyCount} comments`}
          </p>
        </div>
      </header>

      <article className="border-b px-5 py-6">
        <div className="mb-5 flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarImage src={album.author.avatarUrl ?? undefined} alt={album.author.displayName} />
            <AvatarFallback>{album.author.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold leading-tight">{album.author.displayName}</p>
              <span className="text-sm text-muted-foreground">@{album.author.username}</span>
              <Badge variant="secondary" className="normal-case tracking-normal">
                <Camera data-icon="inline-start" />
                Photography
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {album.publishedAt
                ? new Date(album.publishedAt * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                : 'Draft'}
            </p>
          </div>
        </div>

        {album.coverUrl && (
          <img src={album.coverUrl} alt="" className="mb-6 aspect-[16/9] w-full rounded-xl border object-cover" />
        )}
        <h1 className="text-3xl font-semibold leading-tight">{album.title}</h1>
        {album.description && <p className="mt-3 text-base leading-7 text-muted-foreground">{album.description}</p>}

        <div className="mt-6 columns-2 gap-2 sm:columns-3">
          {photos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              className="mb-2 block w-full overflow-hidden rounded-lg border bg-card/30 text-left"
              onClick={() => setSelectedPhoto(photo)}
            >
              <img src={photo.previewUrl} alt={photo.altText || photo.title || album.title} className="w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-1 text-muted-foreground">
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
        </div>
      </article>

      <Discussion post={replyPost} comments={replies} detailKey={detailKey} />

      <Dialog open={selectedPhoto !== null} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent
          showCloseButton={false}
          className="h-[min(92vh,900px)] w-[calc(100vw-1rem)] max-w-none gap-0 overflow-hidden rounded-2xl border bg-background/95 p-0 shadow-2xl sm:!max-w-[min(96vw,1200px)]"
        >
          <DialogTitle className="sr-only">{selectedPhoto?.title || album.title}</DialogTitle>
          {selectedPhoto && (
            <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-1">
              <div
                className="relative flex min-h-0 touch-pan-y select-none items-center justify-center bg-black"
                onPointerDown={handlePhotoPointerDown}
                onPointerUp={handlePhotoPointerUp}
                onPointerCancel={() => {
                  swipeStartRef.current = null
                }}
              >
                <img
                  src={selectedPhoto.displayUrl || selectedPhoto.previewUrl}
                  alt={selectedPhoto.altText || selectedPhoto.title || album.title}
                  className="h-full max-h-full w-full object-contain"
                  draggable={false}
                />
                {photos.length > 1 && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute left-3 top-1/2 size-10 -translate-y-1/2 rounded-full bg-background/20 text-white shadow-lg backdrop-blur hover:bg-background/35 hover:text-white disabled:opacity-30"
                      onClick={(event) => {
                        event.stopPropagation()
                        showPreviousPhoto()
                      }}
                      disabled={!canMovePrevious}
                      aria-label="Previous photo"
                    >
                      <ChevronLeft />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-3 top-1/2 size-10 -translate-y-1/2 rounded-full bg-background/20 text-white shadow-lg backdrop-blur hover:bg-background/35 hover:text-white disabled:opacity-30"
                      onClick={(event) => {
                        event.stopPropagation()
                        showNextPhoto()
                      }}
                      disabled={!canMoveNext}
                      aria-label="Next photo"
                    >
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
              <aside className="flex max-h-72 min-h-0 flex-col gap-4 overflow-y-auto border-t p-4 md:max-h-none md:border-l md:border-t-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {photos.length > 1 && selectedPhotoIndex >= 0 && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Photo {selectedPhotoIndex + 1} of {photos.length}
                      </p>
                    )}
                    <p className="font-semibold">{selectedPhoto.title || album.title}</p>
                    {selectedPhoto.caption && <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedPhoto.caption}</p>}
                    {selectedPhoto.originalUrl && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {selectedPhoto.displayUrl === selectedPhoto.originalUrl
                          ? 'Viewing original file.'
                          : 'Viewing web preview. Download the original file below.'}
                      </p>
                    )}
                  </div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setSelectedPhoto(null)} aria-label="Close photo">
                    <X />
                  </Button>
                </div>
                {selectedPhoto.originalUrl && (
                  <Button asChild variant="outline" className="w-full">
                    <a href={selectedPhoto.originalUrl}>
                      <Download data-icon="inline-start" />
                      Download original
                    </a>
                  </Button>
                )}
              </aside>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
