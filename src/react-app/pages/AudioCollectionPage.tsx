import { useQuery } from '@tanstack/react-query'
import { Disc3, Play, Podcast } from 'lucide-react'
import { useAudioPlayer } from '../context/AudioPlayerContext'
import { audioCollectionDetailQueryOptions, type AudioCollectionKind } from '../lib/audio'
import { LoadingBlock } from '../components/LoadingBlock'
import { AudioCard } from '../components/AudioCard'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

export function AudioCollectionPage({
  username,
  slug,
  expectedKind,
}: {
  username: string
  slug: string
  expectedKind: AudioCollectionKind
}) {
  const player = useAudioPlayer()
  const detailQuery = useQuery(audioCollectionDetailQueryOptions(username, slug))

  if (detailQuery.isPending) return <LoadingBlock label="Loading collection" />
  if (detailQuery.isError) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
        <p className="text-lg font-medium">Unable to load collection</p>
        <p className="text-sm">{detailQuery.error.message}</p>
      </div>
    )
  }

  const { collection, items } = detailQuery.data
  const Icon = collection.kind === 'album' ? Disc3 : Podcast
  const label = collection.kind === 'album' ? 'Album' : 'Podcast'

  if (collection.kind !== expectedKind) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <p>Collection type does not match this route.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-screen max-w-[640px] border-x bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/90 px-5 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold">{label}</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} {collection.kind === 'album' ? 'tracks' : 'episodes'}
          </p>
        </div>
      </header>

      <section className="border-b px-5 py-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="size-36 shrink-0 overflow-hidden rounded-2xl border bg-card sm:size-40">
            {collection.coverUrl ? (
              <img src={collection.coverUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Icon aria-hidden="true" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <Badge variant="secondary" className="normal-case tracking-normal">
              <Icon data-icon="inline-start" />
              {label}
            </Badge>
            <h1 className="mt-3 text-3xl font-semibold leading-tight">{collection.title}</h1>
            {collection.description && (
              <p className="mt-3 text-[15px] leading-7 text-muted-foreground">{collection.description}</p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarImage src={collection.creator.avatarUrl ?? undefined} alt={collection.creator.displayName} />
                <AvatarFallback>{collection.creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{collection.creator.displayName}</p>
                <p className="text-xs text-muted-foreground">@{collection.creator.username}</p>
              </div>
            </div>
            <Button
              type="button"
              className="mt-5 rounded-full"
              disabled={items.length === 0 || !items[0]?.streamUrl}
              onClick={() => items[0] && player.playItem(items[0], items)}
            >
              <Play data-icon="inline-start" />
              Play latest
            </Button>
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <div className="border-b p-5">
          <p className="text-sm text-muted-foreground">No published audio yet.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((item) => <AudioCard key={item.id} item={item} queue={items} />)}
        </div>
      )}
    </div>
  )
}
