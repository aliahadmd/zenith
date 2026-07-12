import { Hono, type Context } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createDb } from '../db/client'
import {
  adminMemberships,
  courseAttachments,
  creatorApplications,
  moderationCases,
  notifications,
  paymentWebhookEvents,
  postReplies,
  posts,
  session,
  subscriptionMemberships,
  users,
} from '../db/schema'
import { assertOwnerWillRemain, writeAdminAuditLog } from '../lib/admin'
import { createNotification } from '../lib/notifications'
import { badRequest, conflict, forbidden, notFound, zodHook } from '../lib/http'
import { adminMiddleware, ownerMiddleware } from '../middleware/admin'
import { authMiddleware, type HonoEnv } from '../middleware/auth'

const reasonSchema = z.string().trim().min(3).max(500)
const decisionSchema = z.object({ reason: reasonSchema, note: z.string().trim().max(1000).optional() })
const reportActionSchema = z.object({
  action: z.enum(['dismiss', 'hide', 'restore', 'suspend', 'restore_user']),
  reason: reasonSchema,
  note: z.string().trim().max(1000).optional(),
})
const adminRoleSchema = z.object({ role: z.enum(['owner', 'moderator']), reason: reasonSchema })

function pagination(c: { req: { query(name: string): string | undefined } }) {
  const page = Math.max(1, Number.parseInt(c.req.query('page') || '1', 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(c.req.query('pageSize') || '20', 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function safeJson(value: string | null) {
  if (!value) return null
  try { return JSON.parse(value) as unknown } catch { return null }
}

async function targetAdminRole(db: ReturnType<typeof createDb>, userId: string) {
  return (await db.select({ role: adminMemberships.role }).from(adminMemberships).where(eq(adminMemberships.userId, userId)).get())?.role ?? null
}

async function ensureCanActOnUser(c: Context<HonoEnv>, userId: string) {
  if (c.var.user.adminRole === 'owner') return null
  if (await targetAdminRole(createDb(c.env.DB), userId)) return forbidden(c, 'Moderators cannot act on administrators')
  return null
}

export const adminRoutes = new Hono<HonoEnv>()
adminRoutes.use('*', authMiddleware, adminMiddleware)

adminRoutes.get('/overview', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM users WHERE role = 'creator') AS creators,
      (SELECT count(*) FROM posts) AS content,
      (SELECT count(*) FROM creator_applications WHERE status = 'pending') AS pendingApplications,
      (SELECT count(*) FROM moderation_cases WHERE status IN ('open', 'reviewing')) AS openReports,
      (SELECT count(*) FROM users WHERE account_status = 'suspended') AS suspendedUsers,
      (SELECT count(*) FROM posts WHERE moderation_status = 'hidden') +
        (SELECT count(*) FROM post_replies WHERE moderation_status = 'hidden') AS hiddenContent
  `).first<Record<string, number>>()
  return c.json({ counts: rows ?? {} })
})

adminRoutes.get('/health', async (c) => {
  const db = createDb(c.env.DB)
  const dayAgo = Math.floor(Date.now() / 1000) - 86400
  const [failedEmails, staleUploads, memberships, webhook, pendingApplications, openReports] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.emailStatus, 'failed'), sql`${notifications.createdAt} >= ${dayAgo}`)).get(),
    db.select({ count: sql<number>`count(*)` }).from(courseAttachments).where(and(eq(courseAttachments.status, 'pending'), sql`${courseAttachments.createdAt} < ${dayAgo}`)).get(),
    db.select({ count: sql<number>`count(*)` }).from(subscriptionMemberships).where(sql`${subscriptionMemberships.status} in ('past_due', 'incomplete')`).get(),
    db.select({ processedAt: paymentWebhookEvents.processedAt }).from(paymentWebhookEvents).orderBy(sql`${paymentWebhookEvents.processedAt} desc`).limit(1).get(),
    db.select({ count: sql<number>`count(*)` }).from(creatorApplications).where(eq(creatorApplications.status, 'pending')).get(),
    db.select({ count: sql<number>`count(*)` }).from(moderationCases).where(sql`${moderationCases.status} in ('open', 'reviewing')`).get(),
  ])

  const signals = {
    d1: { status: 'healthy' as const, value: 'available' },
    failedNotificationEmails: { status: Number(failedEmails?.count ?? 0) ? 'attention' as const : 'healthy' as const, value: Number(failedEmails?.count ?? 0) },
    staleCourseUploads: { status: Number(staleUploads?.count ?? 0) ? 'attention' as const : 'healthy' as const, value: Number(staleUploads?.count ?? 0) },
    incompleteMemberships: { status: Number(memberships?.count ?? 0) ? 'attention' as const : 'healthy' as const, value: Number(memberships?.count ?? 0) },
    stripeWebhooks: webhook ? { status: 'healthy' as const, value: webhook.processedAt } : { status: 'no_data' as const, value: null },
    reviewWorkload: {
      status: Number(pendingApplications?.count ?? 0) + Number(openReports?.count ?? 0) > 20 ? 'attention' as const : 'healthy' as const,
      value: { applications: Number(pendingApplications?.count ?? 0), reports: Number(openReports?.count ?? 0) },
    },
  }
  const overall = Object.values(signals).some((signal) => signal.status === 'attention') ? 'attention' : 'healthy'
  return c.json({ overall, signals, cloudflareDashboardUrl: c.env.ADMIN_CLOUDFLARE_DASHBOARD_URL || null })
})

adminRoutes.get('/applications', async (c) => {
  const { page, pageSize, offset } = pagination(c)
  const search = `%${(c.req.query('search') || '').trim()}%`
  const status = c.req.query('status') || ''
  const query = `FROM creator_applications a JOIN users u ON u.id = a.user_id
    WHERE (? = '' OR a.status = ?) AND (? = '%%' OR u.email LIKE ? OR u.username LIKE ? OR a.full_name LIKE ?)`
  const bindings = [status, status, search, search, search, search]
  const [items, total] = await Promise.all([
    c.env.DB.prepare(`SELECT a.id, a.user_id AS userId, a.full_name AS fullName, a.city, a.country, a.status,
      a.created_at AS createdAt, a.updated_at AS updatedAt, u.email, u.username ${query}
      ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all(),
    c.env.DB.prepare(`SELECT count(*) AS count ${query}`).bind(...bindings).first<{ count: number }>(),
  ])
  return c.json({ items: items.results, page, pageSize, total: Number(total?.count ?? 0) })
})

adminRoutes.get('/applications/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT a.*, u.email, u.username, u.display_name AS displayName
    FROM creator_applications a JOIN users u ON u.id = a.user_id WHERE a.id = ?`).bind(c.req.param('id')).first<Record<string, unknown>>()
  if (!row) return notFound(c, 'Application not found')
  delete row.nid_document_r2_key
  return c.json({ ...row, social_links: safeJson(row.social_links as string), content_links: safeJson(row.content_links as string) })
})

adminRoutes.get('/applications/:id/document', async (c) => {
  const db = createDb(c.env.DB)
  const application = await db.select({ id: creatorApplications.id, nidDocumentR2Key: creatorApplications.nidDocumentR2Key })
    .from(creatorApplications).where(eq(creatorApplications.id, c.req.param('id'))).get()
  if (!application) return notFound(c, 'Application not found')
  const object = await c.env.STORAGE.get(application.nidDocumentR2Key)
  if (!object) return notFound(c, 'Document not found')
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'creator_document_viewed', targetType: 'creator_application', targetId: application.id })
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Disposition': 'inline' })
  object.writeHttpMetadata(headers)
  return new Response(object.body, { headers })
})

adminRoutes.post('/applications/:id/approve', zValidator('json', decisionSchema, zodHook), async (c) => {
  const input = c.req.valid('json')
  const db = createDb(c.env.DB)
  const application = await db.select().from(creatorApplications).where(eq(creatorApplications.id, c.req.param('id'))).get()
  if (!application) return notFound(c, 'Application not found')
  if (application.status !== 'pending') return conflict(c, 'Only pending applications can be approved')
  const now = new Date()
  await db.batch([
    db.update(creatorApplications).set({ status: 'approved', reviewedBy: c.var.user.id, reviewedAt: now, decisionReason: null, adminNote: input.note || null, updatedAt: now }).where(eq(creatorApplications.id, application.id)),
    db.update(users).set({ role: 'creator' }).where(eq(users.id, application.userId)),
  ])
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'creator_application_approved', targetType: 'creator_application', targetId: application.id, reason: input.reason })
  await createNotification(db, c.env, { recipientId: application.userId, actorId: c.var.user.id, type: 'creator_application_approved', category: 'account', title: 'Creator application approved', body: 'Your creator application was approved. Creator Studio is now available.', targetUrl: '/studio', entityType: 'creator_application', entityId: application.id, dedupeKey: `creator-application:${application.id}:approved:${Date.now()}`, forceEmail: true }, new URL(c.req.url).origin)
  return c.json({ status: 'approved' })
})

adminRoutes.post('/applications/:id/reject', zValidator('json', decisionSchema, zodHook), async (c) => {
  const input = c.req.valid('json')
  const db = createDb(c.env.DB)
  const application = await db.select().from(creatorApplications).where(eq(creatorApplications.id, c.req.param('id'))).get()
  if (!application) return notFound(c, 'Application not found')
  if (application.status !== 'pending') return conflict(c, 'Only pending applications can be rejected')
  const now = new Date()
  await db.update(creatorApplications).set({ status: 'rejected', reviewedBy: c.var.user.id, reviewedAt: now, decisionReason: input.reason, adminNote: input.note || null, updatedAt: now }).where(eq(creatorApplications.id, application.id)).run()
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'creator_application_rejected', targetType: 'creator_application', targetId: application.id, reason: input.reason })
  await createNotification(db, c.env, { recipientId: application.userId, actorId: c.var.user.id, type: 'creator_application_rejected', category: 'account', title: 'Creator application needs changes', body: input.reason, targetUrl: '/become-creator', entityType: 'creator_application', entityId: application.id, dedupeKey: `creator-application:${application.id}:rejected:${Date.now()}`, forceEmail: true }, new URL(c.req.url).origin)
  return c.json({ status: 'rejected' })
})

adminRoutes.get('/reports', async (c) => {
  const { page, pageSize, offset } = pagination(c)
  const status = c.req.query('status') || ''
  const targetType = c.req.query('targetType') || ''
  const assigned = c.req.query('assigned') || ''
  const query = `FROM moderation_cases mc
    WHERE (? = '' OR mc.status = ?) AND (? = '' OR mc.target_type = ?)
      AND (? = '' OR (? = 'me' AND mc.assigned_admin_id = ?) OR (? = 'unassigned' AND mc.assigned_admin_id IS NULL))`
  const bindings = [status, status, targetType, targetType, assigned, assigned, c.var.user.id, assigned]
  const [items, total] = await Promise.all([
    c.env.DB.prepare(`SELECT mc.*, (SELECT count(*) FROM content_reports r WHERE r.case_id = mc.id) AS reportCount ${query} ORDER BY mc.updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all(),
    c.env.DB.prepare(`SELECT count(*) AS count ${query}`).bind(...bindings).first<{ count: number }>(),
  ])
  return c.json({ items: items.results, page, pageSize, total: Number(total?.count ?? 0) })
})

adminRoutes.get('/reports/:id', async (c) => {
  const moderationCase = await c.env.DB.prepare(`SELECT * FROM moderation_cases WHERE id = ?`).bind(c.req.param('id')).first()
  if (!moderationCase) return notFound(c, 'Moderation case not found')
  const reports = await c.env.DB.prepare(`SELECT r.*, u.email, u.username FROM content_reports r JOIN users u ON u.id = r.reporter_id WHERE r.case_id = ? ORDER BY r.created_at DESC`).bind(c.req.param('id')).all()
  return c.json({ case: moderationCase, reports: reports.results })
})

adminRoutes.post('/reports/:id/assign', zValidator('json', z.object({ adminId: z.string().nullable(), reason: reasonSchema }), zodHook), async (c) => {
  const { adminId, reason } = c.req.valid('json')
  const db = createDb(c.env.DB)
  if (adminId && !await targetAdminRole(db, adminId)) return badRequest(c, 'Assignee must be an administrator')
  const moderationCase = await db.select().from(moderationCases).where(eq(moderationCases.id, c.req.param('id'))).get()
  if (!moderationCase) return notFound(c, 'Moderation case not found')
  await db.update(moderationCases).set({ assignedAdminId: adminId, status: adminId ? 'reviewing' : 'open', updatedAt: new Date() }).where(eq(moderationCases.id, moderationCase.id)).run()
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'moderation_case_assigned', targetType: 'moderation_case', targetId: moderationCase.id, reason, metadata: { assignedAdminId: adminId } })
  return c.json({ assignedAdminId: adminId })
})

adminRoutes.post('/reports/:id/action', zValidator('json', reportActionSchema, zodHook), async (c) => {
  const input = c.req.valid('json')
  const db = createDb(c.env.DB)
  const moderationCase = await db.select().from(moderationCases).where(eq(moderationCases.id, c.req.param('id'))).get()
  if (!moderationCase) return notFound(c, 'Moderation case not found')
  const now = new Date()
  let affectedUserId: string | null = moderationCase.targetType === 'user' ? moderationCase.targetId : null

  if (moderationCase.targetType === 'post') {
    const post = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, moderationCase.targetId)).get()
    if (!post) return notFound(c, 'Reported post not found')
    affectedUserId = post.authorId
    if (!['hide', 'restore', 'dismiss'].includes(input.action)) return badRequest(c, 'Action does not match the report target')
    if (input.action !== 'dismiss') await db.update(posts).set({ moderationStatus: input.action === 'hide' ? 'hidden' : 'active', moderationReason: input.action === 'hide' ? input.reason : null, moderatedAt: now, moderatedBy: c.var.user.id }).where(eq(posts.id, moderationCase.targetId)).run()
  } else if (moderationCase.targetType === 'reply') {
    const reply = await db.select({ authorId: postReplies.authorId }).from(postReplies).where(eq(postReplies.id, moderationCase.targetId)).get()
    if (!reply) return notFound(c, 'Reported reply not found')
    affectedUserId = reply.authorId
    if (!['hide', 'restore', 'dismiss'].includes(input.action)) return badRequest(c, 'Action does not match the report target')
    if (input.action !== 'dismiss') await db.update(postReplies).set({ moderationStatus: input.action === 'hide' ? 'hidden' : 'active', moderationReason: input.action === 'hide' ? input.reason : null, moderatedAt: now, moderatedBy: c.var.user.id }).where(eq(postReplies.id, moderationCase.targetId)).run()
  } else {
    if (!['suspend', 'restore_user', 'dismiss'].includes(input.action)) return badRequest(c, 'Action does not match the report target')
    const denied = await ensureCanActOnUser(c, moderationCase.targetId)
    if (denied) return denied
    if (input.action === 'suspend') await suspendUser(c, moderationCase.targetId, input.reason)
    if (input.action === 'restore_user') await restoreUser(c, moderationCase.targetId, input.reason)
  }

  const status = input.action === 'dismiss' ? 'dismissed' : 'resolved'
  await db.update(moderationCases).set({ status, resolutionAction: input.action, resolutionNote: input.note || input.reason, resolvedBy: c.var.user.id, resolvedAt: now, updatedAt: now }).where(eq(moderationCases.id, moderationCase.id)).run()
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: `moderation_${input.action}`, targetType: moderationCase.targetType, targetId: moderationCase.targetId, reason: input.reason, metadata: { caseId: moderationCase.id } })
  if (affectedUserId && ['hide', 'restore'].includes(input.action)) await createNotification(db, c.env, { recipientId: affectedUserId, actorId: c.var.user.id, type: input.action === 'hide' ? 'content_hidden' : 'content_restored', category: 'account', title: input.action === 'hide' ? 'Content hidden by moderation' : 'Content restored', body: input.reason, targetUrl: '/studio', entityType: moderationCase.targetType, entityId: moderationCase.targetId, dedupeKey: `moderation:${moderationCase.id}:${input.action}:${Date.now()}`, forceEmail: true }, new URL(c.req.url).origin)
  return c.json({ status, action: input.action })
})

adminRoutes.get('/users', async (c) => {
  const { page, pageSize, offset } = pagination(c)
  const search = `%${(c.req.query('search') || '').trim()}%`
  const role = c.req.query('role') || ''
  const accountStatus = c.req.query('accountStatus') || ''
  const admin = c.req.query('admin') || ''
  const query = `FROM users u LEFT JOIN admin_memberships am ON am.user_id = u.id
    WHERE (? = '%%' OR u.email LIKE ? OR u.username LIKE ? OR u.id LIKE ?)
      AND (? = '' OR u.role = ?) AND (? = '' OR u.account_status = ?)
      AND (? = '' OR (? = 'yes' AND am.user_id IS NOT NULL) OR (? = 'no' AND am.user_id IS NULL))`
  const bindings = [search, search, search, search, role, role, accountStatus, accountStatus, admin, admin, admin]
  const [items, total] = await Promise.all([
    c.env.DB.prepare(`SELECT u.id, u.email, u.username, u.display_name AS displayName, u.role, u.account_status AS accountStatus, u.created_at AS createdAt, am.role AS adminRole ${query} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, offset).all(),
    c.env.DB.prepare(`SELECT count(*) AS count ${query}`).bind(...bindings).first<{ count: number }>(),
  ])
  return c.json({ items: items.results, page, pageSize, total: Number(total?.count ?? 0) })
})

adminRoutes.get('/users/:id', async (c) => {
  const user = await c.env.DB.prepare(`SELECT u.id, u.email, u.username, u.display_name AS displayName, u.role,
    u.account_status AS accountStatus, u.suspension_reason AS suspensionReason, u.suspended_at AS suspendedAt,
    u.created_at AS createdAt, am.role AS adminRole FROM users u LEFT JOIN admin_memberships am ON am.user_id = u.id WHERE u.id = ?`).bind(c.req.param('id')).first()
  if (!user) return notFound(c, 'User not found')
  const history = await c.env.DB.prepare(`SELECT action, reason, created_at AS createdAt FROM admin_audit_logs WHERE target_type = 'user' AND target_id = ? ORDER BY created_at DESC LIMIT 50`).bind(c.req.param('id')).all()
  return c.json({ user, history: history.results })
})

adminRoutes.post('/users/:id/suspend', zValidator('json', decisionSchema, zodHook), async (c) => {
  const { reason } = c.req.valid('json')
  const denied = await ensureCanActOnUser(c, c.req.param('id'))
  if (denied) return denied
  await suspendUser(c, c.req.param('id'), reason)
  const db = createDb(c.env.DB)
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'user_suspended', targetType: 'user', targetId: c.req.param('id'), reason })
  return c.json({ accountStatus: 'suspended' })
})

adminRoutes.post('/users/:id/restore', zValidator('json', decisionSchema, zodHook), async (c) => {
  const { reason } = c.req.valid('json')
  const denied = await ensureCanActOnUser(c, c.req.param('id'))
  if (denied) return denied
  await restoreUser(c, c.req.param('id'), reason)
  const db = createDb(c.env.DB)
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'user_restored', targetType: 'user', targetId: c.req.param('id'), reason })
  return c.json({ accountStatus: 'active' })
})

adminRoutes.post('/users/:id/revoke-sessions', zValidator('json', decisionSchema, zodHook), async (c) => {
  const { reason } = c.req.valid('json')
  const denied = await ensureCanActOnUser(c, c.req.param('id'))
  if (denied) return denied
  const db = createDb(c.env.DB)
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, c.req.param('id'))).get()
  if (!user) return notFound(c, 'User not found')
  await db.delete(session).where(eq(session.userId, user.id)).run()
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'sessions_revoked', targetType: 'user', targetId: user.id, reason })
  return c.json({ revoked: true })
})

adminRoutes.get('/audit-log', async (c) => {
  const { page, pageSize, offset } = pagination(c)
  const action = c.req.query('action') || ''
  const query = `FROM admin_audit_logs l JOIN users u ON u.id = l.actor_id WHERE (? = '' OR l.action = ?)`
  const [items, total] = await Promise.all([
    c.env.DB.prepare(`SELECT l.id, l.actor_id AS actorId, u.email AS actorEmail, l.action, l.target_type AS targetType, l.target_id AS targetId, l.reason, l.metadata, l.created_at AS createdAt ${query} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`).bind(action, action, pageSize, offset).all(),
    c.env.DB.prepare(`SELECT count(*) AS count ${query}`).bind(action, action).first<{ count: number }>(),
  ])
  return c.json({ items: items.results, page, pageSize, total: Number(total?.count ?? 0) })
})

adminRoutes.get('/administrators', ownerMiddleware, async (c) => {
  const rows = await c.env.DB.prepare(`SELECT am.user_id AS userId, am.role, am.granted_by AS grantedBy, am.created_at AS createdAt, u.email, u.username, u.account_status AS accountStatus FROM admin_memberships am JOIN users u ON u.id = am.user_id ORDER BY am.created_at`).all()
  return c.json({ items: rows.results })
})

adminRoutes.post('/administrators/:userId', ownerMiddleware, zValidator('json', adminRoleSchema, zodHook), async (c) => {
  const input = c.req.valid('json')
  const db = createDb(c.env.DB)
  const target = await db.select({ id: users.id }).from(users).where(eq(users.id, c.req.param('userId'))).get()
  if (!target) return notFound(c, 'User not found')
  if (!await assertOwnerWillRemain(db, target.id, input.role)) return conflict(c, 'The final owner cannot be demoted')
  await db.insert(adminMemberships).values({ userId: target.id, role: input.role, grantedBy: c.var.user.id }).onConflictDoUpdate({ target: adminMemberships.userId, set: { role: input.role, updatedAt: new Date() } }).run()
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'administrator_role_changed', targetType: 'user', targetId: target.id, reason: input.reason, metadata: { role: input.role } })
  return c.json({ userId: target.id, role: input.role })
})

adminRoutes.delete('/administrators/:userId', ownerMiddleware, zValidator('json', z.object({ reason: reasonSchema }), zodHook), async (c) => {
  const { reason } = c.req.valid('json')
  const db = createDb(c.env.DB)
  if (!await assertOwnerWillRemain(db, c.req.param('userId'), null)) return conflict(c, 'The final owner cannot be removed')
  const membership = await targetAdminRole(db, c.req.param('userId'))
  if (!membership) return notFound(c, 'Administrator not found')
  await writeAdminAuditLog(db, { actorId: c.var.user.id, action: 'administrator_revoked', targetType: 'user', targetId: c.req.param('userId'), reason, metadata: { previousRole: membership } })
  await db.delete(adminMemberships).where(eq(adminMemberships.userId, c.req.param('userId'))).run()
  return c.json({ revoked: true })
})

async function suspendUser(c: Context<HonoEnv>, userId: string, reason: string) {
  const db = createDb(c.env.DB)
  const user = await db.select({ id: users.id, accountStatus: users.accountStatus }).from(users).where(eq(users.id, userId)).get()
  if (!user) throw new Error('User not found')
  await createNotification(db, c.env, { recipientId: userId, actorId: c.var.user.id, type: 'account_suspended', category: 'account', title: 'Your Zenith account was suspended', body: reason, entityType: 'user', entityId: userId, dedupeKey: `account:${userId}:suspended:${Date.now()}`, forceEmail: true }, new URL(c.req.url).origin)
  await db.update(users).set({ accountStatus: 'suspended', suspensionReason: reason, suspendedAt: new Date(), suspendedBy: c.var.user.id }).where(eq(users.id, userId)).run()
  await db.delete(session).where(eq(session.userId, userId)).run()
}

async function restoreUser(c: Context<HonoEnv>, userId: string, reason: string) {
  const db = createDb(c.env.DB)
  const user = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()
  if (!user) throw new Error('User not found')
  await db.update(users).set({ accountStatus: 'active', suspensionReason: null, suspendedAt: null, suspendedBy: null }).where(eq(users.id, userId)).run()
  await createNotification(db, c.env, { recipientId: userId, actorId: c.var.user.id, type: 'account_restored', category: 'account', title: 'Your Zenith account was restored', body: reason, entityType: 'user', entityId: userId, dedupeKey: `account:${userId}:restored:${Date.now()}`, forceEmail: true }, new URL(c.req.url).origin)
}
