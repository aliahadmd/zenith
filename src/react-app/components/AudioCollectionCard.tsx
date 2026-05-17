import { Link } from '@tanstack/react-router'
import { Disc3, Podcast } from 'lucide-react'
import type { AudioCollectionSummary } from '../lib/audio'
import { Badge } from './ui/badge'

export function AudioCollectionCard({ collection }: { collection: AudioCollectionSummary }) {
  const route = collection.kind === 'album' ? '/u/$username/album/$slug' : '/u/$username/podcast/$slug'
  const Icon = collection.kind === 'album' ? Disc3 : Podcast

  return (
    <Link
      to={route}
      params={{ username: collection.creator.username, slug: collection.slug }}
      className="flex min-h-28 gap-3 border-b px-5 py-4 transition-colors hover:bg-card/40"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border bg-card">
        {collection.coverUrl ? (
          <img src={collection.coverUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Icon aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="normal-case tracking-normal">
            <Icon data-icon="inline-start" />
            {collection.kind === 'album' ? 'Album' : 'Podcast'}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {collection.itemCount} {collection.kind === 'album' ? 'track' : 'episode'}{collection.itemCount === 1 ? '' : 's'}
          </span>
        </div>
        <h3 className="mt-2 truncate text-base font-semibold">{collection.title}</h3>
        {collection.description && (
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{collection.description}</p>
        )}
      </div>
    </Link>
  )
}
