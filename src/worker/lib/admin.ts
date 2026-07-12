import { eq, sql } from 'drizzle-orm'
import type { Db } from '../db/client'
import { adminAuditLogs, adminMemberships } from '../db/schema'

export type AdminRole = 'owner' | 'moderator'

export async function writeAdminAuditLog(db: Db, input: {
  actorId: string
  action: string
  targetType: string
  targetId: string
  reason?: string | null
  metadata?: Record<string, unknown> | null
}) {
  await db.insert(adminAuditLogs).values({
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason?.trim() || null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  }).run()

  console.log(JSON.stringify({
    event: 'admin_action',
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
  }))
}

export async function getAdminRole(db: Db, userId: string) {
  return await db
    .select({ role: adminMemberships.role })
    .from(adminMemberships)
    .where(eq(adminMemberships.userId, userId))
    .get()
}

export async function assertOwnerWillRemain(db: Db, userId: string, nextRole: AdminRole | null) {
  const membership = await getAdminRole(db, userId)
  if (membership?.role !== 'owner' || nextRole === 'owner') return true

  const row = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminMemberships)
    .where(eq(adminMemberships.role, 'owner'))
    .get()

  return Number(row?.count ?? 0) > 1
}
