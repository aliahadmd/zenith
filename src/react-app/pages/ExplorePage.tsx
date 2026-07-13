import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Compass, Search, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { CreatorDiscoveryCard } from '../components/CreatorDiscoveryCard'
import { DiscoveryCategoryPicker } from '../components/DiscoveryCategoryPicker'
import { LoadingBlock } from '../components/LoadingBlock'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import {
  creatorSearchQueryOptions,
  discoveryKeys,
  discoveryOverviewQueryOptions,
  updateDiscoveryInterests,
  type DiscoveryCategory,
  type DiscoverySort,
} from '../lib/discovery'

export type ExploreSearch = {
  q: string
  category: string
  sort: DiscoverySort
  page: number
}

export function ExplorePage({
  search,
  onSearchChange,
}: {
  search: ExploreSearch
  onSearchChange: (next: Partial<ExploreSearch>) => void
}) {
  const overviewQuery = useQuery(discoveryOverviewQueryOptions)
  const browsing = Boolean(search.q || search.category)
  const creatorsQuery = useQuery(creatorSearchQueryOptions({ ...search, pageSize: 20 }, browsing))

  if (overviewQuery.isPending) return <LoadingBlock label="Loading creator discovery" />
  if (overviewQuery.isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="font-medium">Unable to load creator discovery</p>
        <p className="text-sm text-muted-foreground">{overviewQuery.error.message}</p>
      </div>
    )
  }

  const overview = overviewQuery.data
  const activeCategory = overview.categories.find((category) => category.slug === search.category)
  const result = creatorsQuery.data
  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1

  return (
    <div className="mx-auto min-h-screen max-w-6xl pb-12">
      <header className="border-b py-6 sm:py-8">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-md border bg-card text-primary">
            <Compass className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Explore creators</h1>
            <p className="mt-1 text-sm text-muted-foreground">Find people publishing work worth following.</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <CreatorSearchForm
            key={search.q}
            initialQuery={search.q}
            onSubmit={(query) => onSearchChange({ q: query, page: 1, sort: query ? 'relevance' : search.sort })}
          />
          {browsing && (
            <Select value={search.sort} onValueChange={(value) => onSearchChange({ sort: value as DiscoverySort, page: 1 })}>
              <SelectTrigger className="w-full sm:w-44" aria-label="Sort creators"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Relevance</SelectItem>
                <SelectItem value="recommended">Recommended</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="recent">Recently active</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      {browsing ? (
        <section className="py-7" aria-labelledby="creator-results-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="creator-results-heading" className="text-lg font-semibold">
                {search.q ? `Results for “${search.q}”` : activeCategory?.name ?? 'Creators'}
              </h2>
              {result && <p className="mt-1 text-sm text-muted-foreground">{result.total} creator{result.total === 1 ? '' : 's'}</p>}
            </div>
            <Button type="button" variant="ghost" onClick={() => onSearchChange({ q: '', category: '', sort: 'relevance', page: 1 })}>Clear filters</Button>
          </div>

          {creatorsQuery.isPending ? <LoadingBlock label="Searching creators" /> : creatorsQuery.isError ? (
            <div className="border-y py-16 text-center">
              <p className="font-medium">Search could not be completed</p>
              <p className="mt-1 text-sm text-muted-foreground">{creatorsQuery.error.message}</p>
            </div>
          ) : result?.creators.length === 0 ? (
            <div className="border-y py-16 text-center">
              <p className="font-medium">No creators match</p>
              <p className="mt-1 text-sm text-muted-foreground">Try a different name, topic, or category.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result?.creators.map((creator) => <CreatorDiscoveryCard key={creator.id} creator={creator} />)}
            </div>
          )}

          {result && result.total > result.pageSize && (
            <div className="mt-6 flex items-center justify-between gap-4 border-t pt-4">
              <p className="text-sm text-muted-foreground">Page {result.page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="icon-sm" aria-label="Previous page" disabled={search.page <= 1 || creatorsQuery.isFetching} onClick={() => onSearchChange({ page: Math.max(1, search.page - 1) })}><ChevronLeft /></Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Next page" disabled={search.page >= totalPages || creatorsQuery.isFetching} onClick={() => onSearchChange({ page: search.page + 1 })}><ChevronRight /></Button>
              </div>
            </div>
          )}
        </section>
      ) : (
        <div className="grid gap-10 py-8">
          {overview.needsInterests && <InterestPrompt categories={overview.categories} />}

          {overview.featured.length > 0 && (
            <section aria-labelledby="featured-creators-heading">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-4 text-primary" aria-hidden="true" />
                <h2 id="featured-creators-heading" className="text-lg font-semibold">Featured creators</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {overview.featured.map((creator) => <CreatorDiscoveryCard key={creator.id} creator={creator} />)}
              </div>
            </section>
          )}

          <section aria-labelledby="recommended-creators-heading">
            <h2 id="recommended-creators-heading" className="text-lg font-semibold">Recommended for you</h2>
            <p className="mt-1 text-sm text-muted-foreground">Based on your interests and activity across Zenith.</p>
            {overview.recommended.length > 0 ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {overview.recommended.map((creator) => <CreatorDiscoveryCard key={creator.id} creator={creator} />)}
              </div>
            ) : (
              <div className="mt-4 border-y py-12 text-center text-sm text-muted-foreground">No new recommendations yet. Browse a category to find more creators.</div>
            )}
          </section>

          <section aria-labelledby="browse-categories-heading">
            <h2 id="browse-categories-heading" className="text-lg font-semibold">Browse categories</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {overview.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSearchChange({ category: category.slug, q: '', sort: 'recommended', page: 1 })}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="text-sm font-medium">{category.name}</span>
                  <span className="text-xs text-muted-foreground">{category.creatorCount}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function CreatorSearchForm({ initialQuery, onSubmit }: { initialQuery: string; onSubmit: (query: string) => void }) {
  const [query, setQuery] = useState(initialQuery)
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSubmit(query.trim())
  }
  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-1 gap-2">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search creators, topics, or categories"
          aria-label="Search creators"
          className="pl-9"
        />
      </div>
      <Button type="submit" size="icon" aria-label="Search"><Search /></Button>
    </form>
  )
}

function InterestPrompt({ categories }: { categories: DiscoveryCategory[] }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const mutation = useMutation({
    mutationFn: () => updateDiscoveryInterests(selected),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discoveryKeys.all })
      toast.success('Your recommendations are ready.')
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Interests could not be saved.'),
  })

  return (
    <section className="border-y py-6" aria-labelledby="interest-picker-heading">
      <div className="mb-5 max-w-2xl">
        <h2 id="interest-picker-heading" className="text-lg font-semibold">Shape your recommendations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose up to five topics. You can change them later in Settings.</p>
      </div>
      <DiscoveryCategoryPicker categories={categories} selected={selected} maximum={5} onChange={setSelected} label="Your interests" />
      <Button type="button" className="mt-4" disabled={selected.length === 0 || mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? 'Saving…' : 'Save interests'}
      </Button>
    </section>
  )
}
