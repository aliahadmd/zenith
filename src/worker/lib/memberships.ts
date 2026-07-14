import { and, eq, gt, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { createDb, type Db } from '../db/client'
import {
  membershipPlanTransitions,
  subscriptionMemberships,
  type SubscriptionMembership,
} from '../db/schema'
import { createPaymentProvider } from './payments'

export function nowSeconds(now = Date.now()) {
  return Math.floor(now / 1000)
}

export function isMembershipEntitled(
  membership: Pick<SubscriptionMembership, 'status' | 'trialEndsAt'> | null | undefined,
  now = nowSeconds(),
) {
  if (!membership) return false
  if (membership.status === 'active') return true
  return membership.status === 'trialing' && (membership.trialEndsAt ?? 0) > now
}

export function membershipEntitlementCondition(now = nowSeconds()) {
  return or(
    eq(subscriptionMemberships.status, 'active'),
    and(
      eq(subscriptionMemberships.status, 'trialing'),
      gt(subscriptionMemberships.trialEndsAt, now),
    ),
  )
}

export function membershipEntitlementSqlText(alias: string, nowExpression = '?') {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Invalid membership SQL alias')
  return `(${alias}.status = 'active' OR (${alias}.status = 'trialing' AND ${alias}.trial_ends_at > ${nowExpression}))`
}

export function membershipEntitlementSql(alias: string, now = nowSeconds()) {
  return sql.raw(membershipEntitlementSqlText(alias, String(now)))
}

export async function expireDueMembershipTrials(db: Db, now = nowSeconds()) {
  const result = await db
    .update(subscriptionMemberships)
    .set({ status: 'expired', updatedAt: new Date(now * 1000) })
    .where(and(
      eq(subscriptionMemberships.accessType, 'trial'),
      eq(subscriptionMemberships.status, 'trialing'),
      lte(subscriptionMemberships.trialEndsAt, now),
    ))
    .run()

  return result.meta.changes ?? 0
}

export async function processMembershipPlanTransitions(env: Env, scheduledTime = Date.now()) {
  const db = createDb(env.DB)
  const now = nowSeconds(scheduledTime)
  const staleBefore = now - 5 * 60
  const candidates = await db
    .select()
    .from(membershipPlanTransitions)
    .where(or(
      and(
        inArray(membershipPlanTransitions.status, ['pending', 'failed']),
        lte(membershipPlanTransitions.nextAttemptAt, now),
        lt(membershipPlanTransitions.attempts, 3),
      ),
      and(
        eq(membershipPlanTransitions.status, 'processing'),
        lt(membershipPlanTransitions.claimedAt, staleBefore),
      ),
    ))
    .limit(25)
    .all()

  let completed = 0
  let failed = 0

  for (const job of candidates) {
    const claimed = await db
      .update(membershipPlanTransitions)
      .set({
        status: 'processing',
        attempts: job.attempts + 1,
        claimedAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(and(
        eq(membershipPlanTransitions.id, job.id),
        eq(membershipPlanTransitions.status, job.status),
      ))
      .run()

    if ((claimed.meta.changes ?? 0) !== 1) continue

    try {
      const result = await createPaymentProvider(env).cancelSubscriptionAtPeriodEnd(job.providerSubscriptionId)
      await db.batch([
        db
          .update(membershipPlanTransitions)
          .set({ status: 'completed', claimedAt: null, updatedAt: now })
          .where(eq(membershipPlanTransitions.id, job.id)),
        db
          .update(subscriptionMemberships)
          .set({ cancelAt: result.cancelAt, updatedAt: new Date(now * 1000) })
          .where(eq(subscriptionMemberships.id, job.membershipId)),
      ])
      completed += 1
    } catch (error) {
      const attempts = job.attempts + 1
      const retryDelay = attempts >= 3 ? 24 * 60 * 60 : attempts === 1 ? 60 : 5 * 60
      await db
        .update(membershipPlanTransitions)
        .set({
          status: 'failed',
          claimedAt: null,
          nextAttemptAt: now + retryDelay,
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown Stripe error',
          updatedAt: now,
        })
        .where(eq(membershipPlanTransitions.id, job.id))
        .run()
      failed += 1
      console.error(JSON.stringify({
        event: 'membership_plan_transition_failed',
        jobId: job.id,
        attempts,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }

  return { claimed: candidates.length, completed, failed }
}

export async function processMembershipMaintenance(env: Env, scheduledTime = Date.now()) {
  const db = createDb(env.DB)
  const expiredTrials = await expireDueMembershipTrials(db, nowSeconds(scheduledTime))
  const transitions = await processMembershipPlanTransitions(env, scheduledTime)
  return { expiredTrials, transitions }
}
