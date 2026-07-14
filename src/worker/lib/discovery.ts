import { membershipEntitlementSqlText } from './memberships'

export const MAX_CREATOR_CATEGORIES = 3
export const MAX_USER_INTERESTS = 5
export const MAX_FEATURED_CREATORS = 12

export type DiscoverySort = 'relevance' | 'recommended' | 'popular' | 'recent'

export type DiscoveryCategorySummary = {
  id: string
  slug: string
  name: string
  description: string | null
  displayOrder: number
  creatorCount: number
}

export type CreatorDiscoveryCard = {
  id: string
  displayName: string
  username: string
  tagline: string | null
  avatarUrl: string | null
  categories: Array<{ id: string; slug: string; name: string }>
  publishedContentCount: number
  contentTypes: Array<'post' | 'article' | 'audio' | 'photography' | 'course'>
  featured: boolean
  viewerSubscribed: boolean
  recommendationReason: string | null
}

type CreatorCandidate = CreatorDiscoveryCard & {
  activeSubscriberCount: number
  recentPublicationCount: number
  latestPublishedAt: number
  featuredOrder: number | null
}

type RawCreatorCandidate = {
  id: string
  displayName: string
  username: string
  tagline: string | null
  avatarUrl: string | null
  publishedContentCount: number
  contentTypes: string | null
  activeSubscriberCount: number
  recentPublicationCount: number
  latestPublishedAt: number
  featuredOrder: number | null
  viewerSubscribed: number
}

function toPublicCard(creator: CreatorCandidate): CreatorDiscoveryCard {
  return {
    id: creator.id,
    displayName: creator.displayName,
    username: creator.username,
    tagline: creator.tagline,
    avatarUrl: creator.avatarUrl,
    categories: creator.categories,
    publishedContentCount: creator.publishedContentCount,
    contentTypes: creator.contentTypes,
    featured: creator.featured,
    viewerSubscribed: creator.viewerSubscribed,
    recommendationReason: creator.recommendationReason,
  }
}

function escapeLike(value: string) {
  return value.replaceAll('!', '!!').replaceAll('%', '!%').replaceAll('_', '!_')
}

function normalizeCandidate(row: RawCreatorCandidate): CreatorCandidate {
  const contentTypeOrder = ['post', 'article', 'audio', 'photography', 'course'] as const
  const allowedTypes = new Set<string>(contentTypeOrder)
  const contentTypes = (row.contentTypes?.split(',') ?? [])
    .filter((kind): kind is CreatorDiscoveryCard['contentTypes'][number] => allowedTypes.has(kind))
    .sort((a, b) => contentTypeOrder.indexOf(a) - contentTypeOrder.indexOf(b))

  return {
    id: row.id,
    displayName: row.displayName,
    username: row.username,
    tagline: row.tagline,
    avatarUrl: row.avatarUrl,
    categories: [],
    publishedContentCount: Number(row.publishedContentCount),
    contentTypes,
    featured: row.featuredOrder !== null,
    viewerSubscribed: Boolean(row.viewerSubscribed),
    recommendationReason: null,
    activeSubscriberCount: Number(row.activeSubscriberCount),
    recentPublicationCount: Number(row.recentPublicationCount),
    latestPublishedAt: Number(row.latestPublishedAt),
    featuredOrder: row.featuredOrder === null ? null : Number(row.featuredOrder),
  }
}

function creatorBaseSql() {
  return `
    SELECT
      u.id,
      u.display_name AS displayName,
      u.username,
      u.tagline,
      u.avatar_url AS avatarUrl,
      (SELECT count(*) FROM posts p
        WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active') AS publishedContentCount,
      (SELECT group_concat(DISTINCT p.kind) FROM posts p
        WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active') AS contentTypes,
      (SELECT count(*) FROM subscription_memberships sm
        WHERE sm.creator_id = u.id AND ${membershipEntitlementSqlText('sm')}) AS activeSubscriberCount,
      (SELECT count(*) FROM posts p
        WHERE p.author_id = u.id AND p.published_at >= ? AND p.moderation_status = 'active') AS recentPublicationCount,
      (SELECT max(p.published_at) FROM posts p
        WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active') AS latestPublishedAt,
      fc.display_order AS featuredOrder,
      EXISTS(SELECT 1 FROM subscription_memberships vm
        WHERE vm.creator_id = u.id AND vm.subscriber_id = ?
          AND ${membershipEntitlementSqlText('vm')}) AS viewerSubscribed
    FROM users u
    LEFT JOIN featured_creators fc ON fc.creator_id = u.id
    WHERE u.role = 'creator' AND u.account_status = 'active'
      AND EXISTS(SELECT 1 FROM posts p
        WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active')`
}

async function loadCreatorCategories(database: D1Database, creatorIds: string[]) {
  const result = new Map<string, CreatorDiscoveryCard['categories']>()
  if (creatorIds.length === 0) return result
  const placeholders = creatorIds.map(() => '?').join(',')
  const rows = await database.prepare(`
    SELECT cc.creator_id AS creatorId, c.id, c.slug, c.name
    FROM creator_categories cc
    JOIN discovery_categories c ON c.id = cc.category_id
    WHERE cc.creator_id IN (${placeholders}) AND c.active = 1
    ORDER BY cc.creator_id, cc.display_order, c.display_order
  `).bind(...creatorIds).all<{ creatorId: string; id: string; slug: string; name: string }>()
  for (const row of rows.results) {
    result.set(row.creatorId, [...(result.get(row.creatorId) ?? []), { id: row.id, slug: row.slug, name: row.name }])
  }
  return result
}

async function enrichCandidates(database: D1Database, candidates: CreatorCandidate[]) {
  const categories = await loadCreatorCategories(database, candidates.map((creator) => creator.id))
  return candidates.map((creator) => ({ ...creator, categories: categories.get(creator.id) ?? [] }))
}

export async function listDiscoveryCategories(database: D1Database): Promise<DiscoveryCategorySummary[]> {
  const rows = await database.prepare(`
    SELECT c.id, c.slug, c.name, c.description, c.display_order AS displayOrder,
      count(DISTINCT CASE WHEN u.account_status = 'active' AND EXISTS(
        SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active'
      ) THEN u.id END) AS creatorCount
    FROM discovery_categories c
    LEFT JOIN creator_categories cc ON cc.category_id = c.id
    LEFT JOIN users u ON u.id = cc.creator_id AND u.role = 'creator'
    WHERE c.active = 1
    GROUP BY c.id
    ORDER BY c.display_order, c.name
  `).all<DiscoveryCategorySummary>()
  return rows.results.map((row) => ({ ...row, creatorCount: Number(row.creatorCount) }))
}

async function loadCandidates(database: D1Database, input: {
  viewerId: string
  query?: string
  category?: string
  sort?: Exclude<DiscoverySort, 'recommended'> | 'featured'
  limit: number
  offset?: number
}) {
  const now = Math.floor(Date.now() / 1000)
  const recentAfter = now - 30 * 86400
  const query = input.query?.trim().toLowerCase() ?? ''
  const escaped = escapeLike(query)
  const bindings: unknown[] = [now, recentAfter, input.viewerId, now]
  let sql = creatorBaseSql()

  if (query) {
    sql += ` AND (
      lower(u.username) LIKE ? ESCAPE '!' OR lower(u.display_name) LIKE ? ESCAPE '!'
      OR lower(coalesce(u.tagline, '')) LIKE ? ESCAPE '!'
      OR EXISTS(SELECT 1 FROM creator_categories cc JOIN discovery_categories c ON c.id = cc.category_id
        WHERE cc.creator_id = u.id AND c.active = 1 AND lower(c.name) LIKE ? ESCAPE '!')
    )`
    const contains = `%${escaped}%`
    bindings.push(contains, contains, contains, contains)
  }

  if (input.category) {
    sql += ` AND EXISTS(SELECT 1 FROM creator_categories cc JOIN discovery_categories c ON c.id = cc.category_id
      WHERE cc.creator_id = u.id AND c.active = 1 AND c.slug = ?)`
    bindings.push(input.category)
  }

  if (input.sort === 'featured') {
    sql += ' AND fc.creator_id IS NOT NULL ORDER BY fc.display_order, lower(u.username)'
  } else if (input.sort === 'recent') {
    sql += ' ORDER BY latestPublishedAt DESC, lower(u.username)'
  } else if (input.sort === 'relevance' && query) {
    sql += ` ORDER BY CASE
      WHEN lower(u.username) = ? THEN 0
      WHEN lower(u.display_name) = ? THEN 1
      WHEN lower(u.username) LIKE ? ESCAPE '!' THEN 2
      WHEN lower(u.display_name) LIKE ? ESCAPE '!' THEN 3
      ELSE 4 END,
      activeSubscriberCount DESC, latestPublishedAt DESC, lower(u.username)`
    bindings.push(query, query, `${escaped}%`, `${escaped}%`)
  } else {
    sql += ' ORDER BY activeSubscriberCount DESC, recentPublicationCount DESC, latestPublishedAt DESC, lower(u.username)'
  }

  sql += ' LIMIT ? OFFSET ?'
  bindings.push(input.limit, input.offset ?? 0)
  const rows = await database.prepare(sql).bind(...bindings).all<RawCreatorCandidate>()
  return enrichCandidates(database, rows.results.map(normalizeCandidate))
}

async function countCandidates(database: D1Database, query = '', category = '') {
  const normalized = query.trim().toLowerCase()
  const escaped = escapeLike(normalized)
  const bindings: unknown[] = []
  let sql = `SELECT count(*) AS count FROM users u WHERE u.role = 'creator' AND u.account_status = 'active'
    AND EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active')`
  if (normalized) {
    sql += ` AND (lower(u.username) LIKE ? ESCAPE '!' OR lower(u.display_name) LIKE ? ESCAPE '!'
      OR lower(coalesce(u.tagline, '')) LIKE ? ESCAPE '!'
      OR EXISTS(SELECT 1 FROM creator_categories cc JOIN discovery_categories c ON c.id = cc.category_id
        WHERE cc.creator_id = u.id AND c.active = 1 AND lower(c.name) LIKE ? ESCAPE '!'))`
    const contains = `%${escaped}%`
    bindings.push(contains, contains, contains, contains)
  }
  if (category) {
    sql += ` AND EXISTS(SELECT 1 FROM creator_categories cc JOIN discovery_categories c ON c.id = cc.category_id
      WHERE cc.creator_id = u.id AND c.active = 1 AND c.slug = ?)`
    bindings.push(category)
  }
  const row = await database.prepare(sql).bind(...bindings).first<{ count: number }>()
  return Number(row?.count ?? 0)
}

type RecommendationSignals = {
  interests: Set<string>
  subscriptions: Set<string>
  behavior: Set<string>
  categoryNames: Map<string, string>
}

async function getRecommendationSignals(database: D1Database, viewerId: string): Promise<RecommendationSignals> {
  const now = Math.floor(Date.now() / 1000)
  const rows = await database.prepare(`
    SELECT c.id, c.name, 'interest' AS source
      FROM user_category_interests i JOIN discovery_categories c ON c.id = i.category_id
      WHERE i.user_id = ? AND c.active = 1
    UNION ALL
    SELECT DISTINCT c.id, c.name, 'subscription' AS source
      FROM subscription_memberships sm
      JOIN creator_categories cc ON cc.creator_id = sm.creator_id
      JOIN discovery_categories c ON c.id = cc.category_id
      WHERE sm.subscriber_id = ? AND c.active = 1
        AND ${membershipEntitlementSqlText('sm')}
    UNION ALL
    SELECT DISTINCT c.id, c.name, 'behavior' AS source
      FROM creator_categories cc
      JOIN discovery_categories c ON c.id = cc.category_id
      WHERE c.active = 1 AND cc.creator_id IN (
        SELECT p.author_id FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE l.user_id = ?
        UNION SELECT p.author_id FROM saved_items s JOIN posts p ON p.id = s.post_id WHERE s.user_id = ?
      )
  `).bind(viewerId, viewerId, now, viewerId, viewerId).all<{ id: string; name: string; source: string }>()

  const signals: RecommendationSignals = {
    interests: new Set(),
    subscriptions: new Set(),
    behavior: new Set(),
    categoryNames: new Map(),
  }
  for (const row of rows.results) {
    signals.categoryNames.set(row.id, row.name)
    if (row.source === 'interest') signals.interests.add(row.id)
    if (row.source === 'subscription') signals.subscriptions.add(row.id)
    if (row.source === 'behavior') signals.behavior.add(row.id)
  }
  return signals
}

function recommendationScore(creator: CreatorCandidate, signals: RecommendationSignals) {
  let score = Math.min(creator.activeSubscriberCount, 25) + Math.min(creator.recentPublicationCount, 10) * 2
  for (const category of creator.categories) {
    if (signals.interests.has(category.id)) score += 100
    if (signals.subscriptions.has(category.id)) score += 40
    if (signals.behavior.has(category.id)) score += 20
  }
  return score
}

function recommendationReason(creator: CreatorCandidate, signals: RecommendationSignals) {
  const interest = creator.categories.find((category) => signals.interests.has(category.id))
  if (interest) return `Matches your ${interest.name} interest`
  if (creator.categories.some((category) => signals.subscriptions.has(category.id))) return 'Similar to creators you follow'
  if (creator.categories.some((category) => signals.behavior.has(category.id))) return 'Based on content you enjoyed'
  if (creator.activeSubscriberCount > 0) return 'Popular on Zenith'
  return 'Recently active on Zenith'
}

async function rankRecommended(database: D1Database, viewerId: string, candidates: CreatorCandidate[]) {
  const signals = await getRecommendationSignals(database, viewerId)
  return candidates
    .filter((creator) => creator.id !== viewerId && !creator.viewerSubscribed)
    .map((creator) => ({ creator, score: recommendationScore(creator, signals) }))
    .sort((a, b) => b.score - a.score
      || b.creator.latestPublishedAt - a.creator.latestPublishedAt
      || a.creator.username.localeCompare(b.creator.username))
    .map(({ creator }) => ({ ...creator, recommendationReason: recommendationReason(creator, signals) }))
}

export async function getDiscoveryOverview(database: D1Database, viewerId: string) {
  const [categories, featured, recommendationPool, interestRows] = await Promise.all([
    listDiscoveryCategories(database),
    loadCandidates(database, { viewerId, sort: 'featured', limit: MAX_FEATURED_CREATORS }),
    loadCandidates(database, { viewerId, sort: 'popular', limit: 1000 }),
    database.prepare(`SELECT c.id, c.slug, c.name FROM user_category_interests i
      JOIN discovery_categories c ON c.id = i.category_id
      WHERE i.user_id = ? AND c.active = 1 ORDER BY c.display_order`).bind(viewerId)
      .all<{ id: string; slug: string; name: string }>(),
  ])
  const recommended = await rankRecommended(database, viewerId, recommendationPool)
  return {
    categories,
    featured: featured.slice(0, MAX_FEATURED_CREATORS).map(toPublicCard),
    recommended: recommended.slice(0, 12).map(toPublicCard),
    interests: interestRows.results,
    needsInterests: interestRows.results.length === 0,
  }
}

export async function searchDiscoveryCreators(database: D1Database, input: {
  viewerId: string
  query: string
  category: string
  sort: DiscoverySort
  page: number
  pageSize: number
}) {
  const total = await countCandidates(database, input.query, input.category)
  if (input.sort === 'recommended') {
    const pool = await loadCandidates(database, {
      viewerId: input.viewerId,
      query: input.query,
      category: input.category,
      sort: 'popular',
      limit: Math.min(1000, total),
    })
    const ranked = await rankRecommended(database, input.viewerId, pool)
    const offset = (input.page - 1) * input.pageSize
    return { creators: ranked.slice(offset, offset + input.pageSize).map(toPublicCard), total: ranked.length }
  }

  return {
    creators: (await loadCandidates(database, {
      viewerId: input.viewerId,
      query: input.query,
      category: input.category,
      sort: input.sort,
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
    })).map(toPublicCard),
    total,
  }
}

export async function getEligibleCreatorCards(database: D1Database, viewerId: string, query = '', limit = 20) {
  return (await loadCandidates(database, { viewerId, query, sort: query ? 'relevance' : 'popular', limit })).map(toPublicCard)
}

export async function getFeaturedCreatorCards(database: D1Database, viewerId: string) {
  return (await loadCandidates(database, { viewerId, sort: 'featured', limit: MAX_FEATURED_CREATORS })).map(toPublicCard)
}

export async function isEligibleCreator(database: D1Database, creatorId: string) {
  const row = await database.prepare(`SELECT 1 AS eligible FROM users u
    WHERE u.id = ? AND u.role = 'creator' AND u.account_status = 'active'
      AND EXISTS(SELECT 1 FROM posts p WHERE p.author_id = u.id AND p.published_at IS NOT NULL AND p.moderation_status = 'active')`)
    .bind(creatorId).first<{ eligible: number }>()
  return Boolean(row?.eligible)
}
