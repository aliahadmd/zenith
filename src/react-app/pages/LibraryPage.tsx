import { useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Bookmark, ChevronLeft, ChevronRight, LockKeyhole, Search, Unlink } from 'lucide-react'
import { ArticleCard } from '../components/ArticleCard'
import { AudioCard } from '../components/AudioCard'
import { CourseCard } from '../components/CourseCard'
import { LoadingBlock } from '../components/LoadingBlock'
import { PhotographyCard } from '../components/PhotographyCard'
import { PostCard } from '../components/PostCard'
import { SaveButton } from '../components/SaveButton'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { libraryQueryOptions, type LibraryContentType, type LibraryItem, type LibrarySort } from '../lib/library'
import type { AudioItemSummary } from '../lib/audio'

const contentTypes: Array<{ value: LibraryContentType; label: string }> = [
  { value: 'all', label: 'All content' },
  { value: 'post', label: 'Posts' },
  { value: 'article', label: 'Articles' },
  { value: 'audio', label: 'Audio' },
  { value: 'photography', label: 'Photography' },
  { value: 'course', label: 'Courses' },
]

export function LibraryPage() {
  const [page, setPage] = useState(1)
  const [type, setType] = useState<LibraryContentType>('all')
  const [sort, setSort] = useState<LibrarySort>('newest')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim())
  const libraryQuery = useQuery(libraryQueryOptions({ page, type, sort, query: deferredQuery }))

  if (libraryQuery.isPending) return <LoadingBlock label="Loading library" />
  if (libraryQuery.isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[720px] flex-col items-center justify-center gap-2 border-x px-6 text-center text-muted-foreground">
        <p className="text-lg font-medium text-foreground">Unable to load your library</p>
        <p className="text-sm">{libraryQuery.error.message}</p>
      </div>
    )
  }

  const response = libraryQuery.data
  const availableAudio = response.items.flatMap((entry) =>
    entry.availability === 'available' && entry.item.type === 'audio' ? [entry.item] : [],
  ) as AudioItemSummary[]
  const totalPages = Math.max(1, Math.ceil(response.total / response.pageSize))
  const filtered = type !== 'all' || Boolean(deferredQuery)

  return (
    <div className="mx-auto flex min-h-screen max-w-[720px] flex-col border-x bg-background">
      <header className="sticky top-14 z-20 border-b bg-background/95 px-5 py-4 backdrop-blur lg:top-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-9 items-center justify-center rounded-md border bg-card text-primary">
            <Bookmark className="size-4" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold leading-tight">Saved Library</h1>
            <p className="mt-1 text-sm text-muted-foreground">Content you want to return to.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_8rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              maxLength={100}
              onChange={(event) => { setQuery(event.target.value); setPage(1) }}
              placeholder="Search saved content"
              aria-label="Search saved content"
              className="pl-9"
            />
          </div>
          <Select value={type} onValueChange={(value) => { setType(value as LibraryContentType); setPage(1) }}>
            <SelectTrigger className="w-full" aria-label="Content type"><SelectValue /></SelectTrigger>
            <SelectContent>{contentTypes.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => { setSort(value as LibrarySort); setPage(1) }}>
            <SelectTrigger className="w-full" aria-label="Sort library"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>

      {response.items.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
          <Bookmark className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 font-medium">{filtered ? 'No saved content matches' : 'Your library is empty'}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {filtered ? 'Try another search or content type.' : 'Use the bookmark button on content you want to revisit.'}
          </p>
          {filtered && <Button type="button" variant="outline" className="mt-4" onClick={() => { setQuery(''); setType('all'); setPage(1) }}>Clear filters</Button>}
        </div>
      ) : (
        <div className="flex flex-col">
          {response.items.map((entry) => <LibraryEntry key={entry.postId} entry={entry} audioQueue={availableAudio} />)}
        </div>
      )}

      {response.total > response.pageSize && (
        <footer className="flex items-center justify-between gap-4 border-t px-5 py-4">
          <p className="text-sm text-muted-foreground">Page {response.page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="icon-sm" disabled={page <= 1 || libraryQuery.isFetching} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page"><ChevronLeft /></Button>
            <Button type="button" variant="outline" size="icon-sm" disabled={page >= totalPages || libraryQuery.isFetching} onClick={() => setPage((value) => value + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
        </footer>
      )}
    </div>
  )
}

function LibraryEntry({ entry, audioQueue }: { entry: LibraryItem; audioQueue: AudioItemSummary[] }) {
  if (entry.availability === 'available') {
    const item = entry.item
    if (item.type === 'article') return <ArticleCard article={item} />
    if (item.type === 'audio') return <AudioCard item={item} queue={audioQueue} />
    if (item.type === 'photography') return <PhotographyCard album={item} />
    if (item.type === 'course') return <CourseCard course={item} />
    return <PostCard post={item} />
  }

  if (entry.availability === 'membership_required') {
    return (
      <article className="flex items-center gap-3 border-b px-5 py-5">
        <Avatar className="size-10">
          <AvatarImage src={entry.creator.avatarUrl ?? undefined} alt={entry.creator.displayName} />
          <AvatarFallback>{entry.creator.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="size-4 text-muted-foreground" />Membership required</div>
          <p className="mt-1 text-sm text-muted-foreground">Saved {entry.type} from <Link to="/u/$username" params={{ username: entry.creator.username }} className="text-foreground hover:underline">@{entry.creator.username}</Link></p>
        </div>
        <SaveButton postId={entry.postId} saved canSave={false} />
      </article>
    )
  }

  return (
    <article className="flex items-center gap-3 border-b px-5 py-5">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground"><Unlink className="size-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Saved item unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">This {entry.type} is no longer available.</p>
      </div>
      <SaveButton postId={entry.postId} saved canSave={false} />
    </article>
  )
}
