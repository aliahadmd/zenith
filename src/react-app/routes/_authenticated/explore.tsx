import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ExplorePage } from '../../pages/ExplorePage'

const searchSchema = z.object({
  q: z.string().catch('').default(''),
  category: z.string().catch('').default(''),
  sort: z.enum(['relevance', 'recommended', 'popular', 'recent']).catch('relevance').default('relevance'),
  page: z.coerce.number().int().min(1).catch(1).default(1),
})

export const Route = createFileRoute('/_authenticated/explore')({
  validateSearch: searchSchema,
  component: ExploreRoute,
})

function ExploreRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return <ExplorePage search={search} onSearchChange={(next) => void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })} />
}
