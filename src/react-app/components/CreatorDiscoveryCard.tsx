import { Link } from '@tanstack/react-router'
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react'
import type { CreatorDiscoveryCardData } from '../lib/discovery'
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar'
import { Badge } from './ui/badge'
import { Button } from './ui/button'

const contentLabels: Record<CreatorDiscoveryCardData['contentTypes'][number], string> = {
  post: 'Posts',
  article: 'Articles',
  audio: 'Audio',
  photography: 'Photography',
  course: 'Courses',
}

export function CreatorDiscoveryCard({ creator }: { creator: CreatorDiscoveryCardData }) {
  return (
    <article className="flex min-h-64 flex-col rounded-md border bg-background p-5 transition-colors hover:border-foreground/20">
      <div className="flex items-start gap-3">
        <Avatar className="size-12">
          <AvatarImage src={creator.avatarUrl ?? undefined} alt={creator.displayName} />
          <AvatarFallback>{creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{creator.displayName}</h3>
            {creator.featured && <Badge variant="secondary"><Sparkles aria-hidden="true" />Featured</Badge>}
            {creator.viewerSubscribed && <Badge><CheckCircle2 aria-hidden="true" />Subscribed</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">@{creator.username}</p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
        {creator.tagline || 'Independent creator on Zenith.'}
      </p>

      <div className="mt-4 flex min-h-6 flex-wrap gap-1.5">
        {creator.categories.map((category) => <Badge key={category.id} variant="outline">{category.name}</Badge>)}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>{creator.publishedContentCount} published</span>
        {creator.contentTypes.map((type) => <span key={type}>{contentLabels[type]}</span>)}
      </div>

      <div className="mt-auto pt-5">
        {creator.recommendationReason && <p className="mb-3 text-xs text-muted-foreground">{creator.recommendationReason}</p>}
        <Button asChild variant="outline" className="w-full justify-between">
          <Link to="/u/$username" params={{ username: creator.username }}>
            View profile
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </article>
  )
}
