import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import {
  getDiscoveryOverview,
  listDiscoveryCategories,
  MAX_CREATOR_CATEGORIES,
  MAX_USER_INTERESTS,
  searchDiscoveryCreators,
} from '../lib/discovery'
import { badRequest, forbidden, zodHook } from '../lib/http'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

const creatorSearchSchema = z.object({
  q: z.string().trim().max(100).default(''),
  category: z.string().trim().max(80).default(''),
  sort: z.enum(['relevance', 'recommended', 'popular', 'recent']).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

function categorySelectionSchema(maximum: number) {
  return z.object({
    categoryIds: z.array(z.string().trim().min(1).max(100)).max(maximum)
      .refine((ids) => new Set(ids).size === ids.length, 'Category selections must be unique'),
  })
}

async function validateActiveCategories(database: D1Database, categoryIds: string[]) {
  if (categoryIds.length === 0) return true
  const placeholders = categoryIds.map(() => '?').join(',')
  const row = await database.prepare(`SELECT count(*) AS count FROM discovery_categories
    WHERE active = 1 AND id IN (${placeholders})`).bind(...categoryIds).first<{ count: number }>()
  return Number(row?.count ?? 0) === categoryIds.length
}

async function replaceActiveSelections(database: D1Database, input: {
  table: 'user_category_interests' | 'creator_categories'
  ownerColumn: 'user_id' | 'creator_id'
  ownerId: string
  categoryIds: string[]
}) {
  const statements = [database.prepare(`DELETE FROM ${input.table} WHERE ${input.ownerColumn} = ?
    AND category_id IN (SELECT id FROM discovery_categories WHERE active = 1)`).bind(input.ownerId)]
  input.categoryIds.forEach((categoryId, index) => {
    statements.push(input.table === 'creator_categories'
      ? database.prepare(`INSERT INTO creator_categories (creator_id, category_id, display_order) VALUES (?, ?, ?)`)
        .bind(input.ownerId, categoryId, index)
      : database.prepare(`INSERT INTO user_category_interests (user_id, category_id) VALUES (?, ?)`)
        .bind(input.ownerId, categoryId))
  })
  await database.batch(statements)
}

export const discoveryRoutes = new Hono<HonoEnv>()
discoveryRoutes.use('*', authMiddleware)

discoveryRoutes.get('/', async (c) => {
  return c.json(await getDiscoveryOverview(c.env.DB, c.var.user.id))
})

discoveryRoutes.get('/creators', zValidator('query', creatorSearchSchema, zodHook), async (c) => {
  const query = c.req.valid('query')
  const result = await searchDiscoveryCreators(c.env.DB, {
    viewerId: c.var.user.id,
    query: query.q,
    category: query.category,
    sort: query.sort,
    page: query.page,
    pageSize: query.pageSize,
  })
  return c.json({ ...result, page: query.page, pageSize: query.pageSize })
})

discoveryRoutes.get('/preferences', async (c) => {
  const [categories, interestRows, creatorCategoryRows] = await Promise.all([
    listDiscoveryCategories(c.env.DB),
    c.env.DB.prepare(`SELECT i.category_id AS categoryId FROM user_category_interests i
      JOIN discovery_categories c ON c.id = i.category_id
      WHERE i.user_id = ? AND c.active = 1 ORDER BY c.display_order`).bind(c.var.user.id)
      .all<{ categoryId: string }>(),
    c.var.user.role === 'creator'
      ? c.env.DB.prepare(`SELECT cc.category_id AS categoryId FROM creator_categories cc
          JOIN discovery_categories c ON c.id = cc.category_id
          WHERE cc.creator_id = ? AND c.active = 1 ORDER BY cc.display_order, c.display_order`)
        .bind(c.var.user.id).all<{ categoryId: string }>()
      : Promise.resolve({ results: [] as Array<{ categoryId: string }> }),
  ])
  return c.json({
    categories,
    interestCategoryIds: interestRows.results.map((row) => row.categoryId),
    creatorCategoryIds: creatorCategoryRows.results.map((row) => row.categoryId),
  })
})

discoveryRoutes.put('/interests', zValidator('json', categorySelectionSchema(MAX_USER_INTERESTS), zodHook), async (c) => {
  const { categoryIds } = c.req.valid('json')
  if (!await validateActiveCategories(c.env.DB, categoryIds)) return badRequest(c, 'Every interest must be an active category')
  await replaceActiveSelections(c.env.DB, {
    table: 'user_category_interests',
    ownerColumn: 'user_id',
    ownerId: c.var.user.id,
    categoryIds,
  })
  return c.json({ categoryIds })
})

discoveryRoutes.put('/creator-categories', zValidator('json', categorySelectionSchema(MAX_CREATOR_CATEGORIES), zodHook), async (c) => {
  if (c.var.user.role !== 'creator') return forbidden(c, 'Only creators can select public creator categories')
  const { categoryIds } = c.req.valid('json')
  if (!await validateActiveCategories(c.env.DB, categoryIds)) return badRequest(c, 'Every creator category must be active')
  await replaceActiveSelections(c.env.DB, {
    table: 'creator_categories',
    ownerColumn: 'creator_id',
    ownerId: c.var.user.id,
    categoryIds,
  })
  return c.json({ categoryIds })
})
