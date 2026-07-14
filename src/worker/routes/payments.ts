import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { createDb, type Db } from '../db/client'
import {
  creatorPaymentAccounts,
  follows,
  membershipPlanPrices,
  membershipPlans,
  membershipPlanTransitions,
  membershipTrialClaims,
  paymentCustomers,
  paymentWebhookEvents,
  revenueEvents,
  subscriptionMemberships,
  users,
  type CreatorPaymentAccount,
  type MembershipPlan,
  type SubscriptionMembership,
} from '../db/schema'
import { authMiddleware, requireRole, type HonoEnv } from '../middleware/auth'
import {
  creatorPlanUpdateSchema,
  customerPortalSchema,
  membershipSubscribeSchema,
  subscriptionOptionsParamSchema,
} from '../lib/schemas'
import { badRequest, conflict, errorResponse, forbidden, notFound, zodHook } from '../lib/http'
import {
  PaymentConfigurationError,
  createPaymentProvider,
  getPlatformFeeBps,
  getStripeWebhookSecret,
} from '../lib/payments'
import { constructStripeWebhookEvent } from '../lib/payments/stripe'
import type { ConnectedAccountSnapshot, MembershipInterval } from '../lib/payments/types'
import {
  notifyMembershipActivated,
  notifySubscriptionStatusChanged,
} from '../lib/notifications'
import { expireDueMembershipTrials, isMembershipEntitled, nowSeconds } from '../lib/memberships'

export const paymentsRoutes = new Hono<HonoEnv>()

type MembershipPlanMode = 'disabled' | 'free_permanent' | 'free_trial' | 'paid'

function isPaymentConfigError(error: unknown) {
  return error instanceof PaymentConfigurationError
}

function paymentSetupRequired(c: Parameters<typeof errorResponse>[0], message: string) {
  return errorResponse(c, 409, 'payment_setup_required', message)
}

function stripeUnavailable(c: Parameters<typeof errorResponse>[0]) {
  return errorResponse(c, 503, 'payment_provider_unconfigured', 'Zenith Stripe Sandbox is not configured')
}

function parseJsonArray(raw: string | null) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function accountStatusFromSnapshot(snapshot: ConnectedAccountSnapshot) {
  return {
    provider: snapshot.provider,
    providerAccountId: snapshot.providerAccountId,
    status: snapshot.status,
    transfersEnabled: snapshot.transfersEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    requirementsDue: snapshot.requirementsDue,
    connected: snapshot.status === 'active',
    sandbox: true as const,
  }
}

function accountStatusFromRow(row: CreatorPaymentAccount | undefined) {
  if (!row) {
    return {
      provider: 'stripe' as const,
      providerAccountId: null,
      status: 'not_connected' as const,
      transfersEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [] as string[],
      connected: false,
      sandbox: true as const,
    }
  }

  return {
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    status: row.status,
    transfersEnabled: row.transfersEnabled,
    payoutsEnabled: row.payoutsEnabled,
    detailsSubmitted: row.detailsSubmitted,
    requirementsDue: parseJsonArray(row.requirementsDue),
    connected: row.status === 'active',
    sandbox: true as const,
  }
}

async function upsertPaymentAccount(db: Db, creatorId: string, snapshot: ConnectedAccountSnapshot) {
  const values = {
    creatorId,
    provider: snapshot.provider,
    providerAccountId: snapshot.providerAccountId,
    status: snapshot.status,
    transfersEnabled: snapshot.transfersEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    requirementsDue: JSON.stringify(snapshot.requirementsDue),
    updatedAt: new Date(),
  }

  await db
    .insert(creatorPaymentAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: creatorPaymentAccounts.creatorId,
      set: {
        providerAccountId: values.providerAccountId,
        status: values.status,
        transfersEnabled: values.transfersEnabled,
        payoutsEnabled: values.payoutsEnabled,
        detailsSubmitted: values.detailsSubmitted,
        requirementsDue: values.requirementsDue,
        updatedAt: values.updatedAt,
      },
    })
    .run()
}

async function getCurrentUser(db: Db, userId: string) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      accountStatus: users.accountStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get()
}

async function getCreatorById(db: Db, creatorId: string) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
      avatarUrl: users.avatarUrl,
      accountStatus: users.accountStatus,
    })
    .from(users)
    .where(eq(users.id, creatorId))
    .get()
}

async function getPlanByCreator(db: Db, creatorId: string) {
  return db.select().from(membershipPlans).where(eq(membershipPlans.creatorId, creatorId)).get()
}

async function getOrCreatePlan(db: Db, creatorId: string): Promise<MembershipPlan> {
  const existing = await getPlanByCreator(db, creatorId)
  if (existing) return existing

  const id = crypto.randomUUID()
  await db.insert(membershipPlans).values({ id, creatorId }).run()
  const created = await getPlanByCreator(db, creatorId)
  if (!created) throw new Error('Failed to create membership plan')
  return created
}

async function getActivePrices(db: Db, planId: string) {
  return db
    .select()
    .from(membershipPlanPrices)
    .where(and(eq(membershipPlanPrices.planId, planId), eq(membershipPlanPrices.active, true)))
    .all()
}

function serializePlan(plan: MembershipPlan | undefined, prices: Awaited<ReturnType<typeof getActivePrices>>) {
  const monthly = prices.find((price) => price.interval === 'monthly')
  const yearly = prices.find((price) => price.interval === 'yearly')

  return {
    id: plan?.id ?? null,
    name: plan?.name ?? 'Membership',
    description: plan?.description ?? '',
    currency: 'usd' as const,
    mode: (plan?.mode ?? 'disabled') as MembershipPlanMode,
    revision: plan?.revision ?? 0,
    freeTrialDays: plan?.mode === 'free_trial' ? plan.freeTrialDays ?? 7 : null,
    sandbox: true as const,
    prices: {
      monthly: monthly
        ? { id: monthly.id, amountCents: monthly.amountCents, providerPriceId: monthly.providerPriceId }
        : null,
      yearly: yearly
        ? { id: yearly.id, amountCents: yearly.amountCents, providerPriceId: yearly.providerPriceId }
        : null,
    },
  }
}

function canUsePaid(account: CreatorPaymentAccount | undefined) {
  return Boolean(
    account?.status === 'active'
    && account.transfersEnabled
    && account.payoutsEnabled
    && account.detailsSubmitted,
  )
}

function serializeMembership(membership: SubscriptionMembership) {
  return {
    id: membership.id,
    status: membership.status,
    accessType: membership.accessType,
    interval: membership.interval,
    trialEndsAt: membership.trialEndsAt,
    currentPeriodEnd: membership.currentPeriodEnd,
    cancelAt: membership.cancelAt,
    entitled: isMembershipEntitled(membership),
  }
}

function stripeStatusToMembershipStatus(status: Stripe.Subscription.Status) {
  if (status === 'active') return 'active'
  if (status === 'trialing') return 'trialing'
  if (status === 'past_due' || status === 'unpaid' || status === 'paused') return 'past_due'
  if (status === 'incomplete') return 'incomplete'
  if (status === 'incomplete_expired') return 'expired'
  return 'canceled'
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]
  return {
    currentPeriodStart: item?.current_period_start ?? null,
    currentPeriodEnd: item?.current_period_end ?? null,
  }
}

// ── Creator payment account ─────────────────────────────────────

paymentsRoutes.get('/creator/account', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const existing = await db
    .select()
    .from(creatorPaymentAccounts)
    .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
    .get()

  if (!existing) return c.json({ account: accountStatusFromRow(undefined) })

  try {
    const snapshot = await createPaymentProvider(c.env).retrieveConnectedAccount(existing.providerAccountId)
    await upsertPaymentAccount(db, c.var.user.id, snapshot)
    return c.json({ account: accountStatusFromSnapshot(snapshot) })
  } catch (error) {
    if (!isPaymentConfigError(error)) console.error(error)
    return c.json({ account: accountStatusFromRow(existing) })
  }
})

paymentsRoutes.post('/creator/onboarding', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const user = await getCurrentUser(db, c.var.user.id)
  if (!user) return notFound(c)

  try {
    const provider = createPaymentProvider(c.env)
    await provider.verifySandboxConfiguration()
    const existing = await db
      .select()
      .from(creatorPaymentAccounts)
      .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
      .get()

    const snapshot = existing
      ? await provider.retrieveConnectedAccount(existing.providerAccountId)
      : await provider.createConnectedAccount({ creatorId: user.id })

    await upsertPaymentAccount(db, c.var.user.id, snapshot)

    const origin = new URL(c.req.url).origin
    const link = await provider.createOnboardingLink({
      providerAccountId: snapshot.providerAccountId,
      refreshUrl: `${origin}/studio/subscriptions?stripe=refresh`,
      returnUrl: `${origin}/studio/subscriptions?stripe=return`,
    })

    return c.json({ account: accountStatusFromSnapshot(snapshot), url: link.url })
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

paymentsRoutes.post('/creator/dashboard-link', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const account = await db
    .select()
    .from(creatorPaymentAccounts)
    .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
    .get()

  if (!account) return paymentSetupRequired(c, 'Connect Stripe before opening the Express Dashboard')

  try {
    const link = await createPaymentProvider(c.env).createDashboardLink(account.providerAccountId)
    return c.json({ url: link.url, sandbox: true })
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

// ── Creator plan ──────────────────────────────────────────────────

paymentsRoutes.get('/creator/plan', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const [plan, account] = await Promise.all([
    getPlanByCreator(db, c.var.user.id),
    db.select().from(creatorPaymentAccounts).where(eq(creatorPaymentAccounts.creatorId, c.var.user.id)).get(),
  ])
  const prices = plan ? await getActivePrices(db, plan.id) : []
  const transitionCounts = plan
    ? await db
        .select({ status: membershipPlanTransitions.status, count: sql<number>`count(*)` })
        .from(membershipPlanTransitions)
        .where(eq(membershipPlanTransitions.planId, plan.id))
        .groupBy(membershipPlanTransitions.status)
        .all()
    : []

  return c.json({
    plan: serializePlan(plan, prices),
    account: accountStatusFromRow(account),
    transitions: Object.fromEntries(transitionCounts.map((row) => [row.status, Number(row.count)])),
  })
})

paymentsRoutes.put(
  '/creator/plan',
  authMiddleware,
  requireRole('creator'),
  zValidator('json', creatorPlanUpdateSchema, zodHook),
  async (c) => {
    const input = c.req.valid('json')
    const db = createDb(c.env.DB)
    const user = await getCurrentUser(db, c.var.user.id)
    if (!user) return notFound(c)

    const plan = await getOrCreatePlan(db, c.var.user.id)
    const oldMode = plan.mode as MembershipPlanMode
    const existingPrices = await getActivePrices(db, plan.id)
    const account = await db
      .select()
      .from(creatorPaymentAccounts)
      .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
      .get()

    if (input.mode === 'paid' && !canUsePaid(account)) {
      return paymentSetupRequired(c, 'Complete Stripe Sandbox Express onboarding before enabling paid memberships')
    }

    const revision = plan.revision + 1
    let providerProductId = plan.providerProductId
    const createdPrices: Array<{
      interval: MembershipInterval
      amountCents: number
      providerProductId: string
      providerPriceId: string
    }> = []

    if (input.mode === 'paid') {
      try {
        const provider = createPaymentProvider(c.env)
        await provider.verifySandboxConfiguration()
        const product = await provider.upsertProduct({
          creatorId: user.id,
          productId: plan.providerProductId,
          planName: input.name,
          description: input.description,
          revision,
        })
        providerProductId = product.id

        const requested = [
          { interval: 'monthly' as const, amountCents: input.monthlyAmountCents },
          ...(input.yearlyAmountCents === undefined
            ? []
            : [{ interval: 'yearly' as const, amountCents: input.yearlyAmountCents }]),
        ]

        for (const requestedPrice of requested) {
          const existing = existingPrices.find((price) => price.interval === requestedPrice.interval)
          if (existing?.amountCents === requestedPrice.amountCents) continue
          createdPrices.push(await provider.createPrice({
            creatorId: user.id,
            planId: plan.id,
            productId: product.id,
            interval: requestedPrice.interval,
            amountCents: requestedPrice.amountCents,
            currency: 'usd',
            revision,
          }))
        }
      } catch (error) {
        if (isPaymentConfigError(error)) return stripeUnavailable(c)
        console.error(error)
        throw error
      }
    }

    const queries: Array<Parameters<Db['batch']>[0][number]> = [
      db
        .update(membershipPlans)
        .set({
          name: input.name,
          description: input.description ?? null,
          mode: input.mode,
          freeTrialDays: input.mode === 'free_trial' ? input.freeTrialDays : null,
          providerProductId,
          revision,
          currency: 'usd',
          updatedAt: new Date(),
        })
        .where(eq(membershipPlans.id, plan.id)),
    ]

    const pricesToArchive = existingPrices.filter((price) => {
      if (input.mode !== 'paid') return true
      if (price.interval === 'yearly' && input.yearlyAmountCents === undefined) return true
      const requestedAmount = price.interval === 'monthly' ? input.monthlyAmountCents : input.yearlyAmountCents
      return requestedAmount !== price.amountCents
    })

    if (pricesToArchive.length > 0) {
      queries.push(
        db
          .update(membershipPlanPrices)
          .set({ active: false, updatedAt: new Date() })
          .where(inArray(membershipPlanPrices.id, pricesToArchive.map((price) => price.id))),
      )
    }

    for (const price of createdPrices) {
      queries.push(
        db.insert(membershipPlanPrices).values({
          planId: plan.id,
          creatorId: user.id,
          provider: 'stripe',
          interval: price.interval,
          amountCents: price.amountCents,
          currency: 'usd',
          providerProductId: price.providerProductId,
          providerPriceId: price.providerPriceId,
        }),
      )
    }

    if (oldMode === 'paid' && input.mode !== 'paid') {
      const paidMemberships = await db
        .select({
          id: subscriptionMemberships.id,
          providerSubscriptionId: subscriptionMemberships.providerSubscriptionId,
        })
        .from(subscriptionMemberships)
        .where(and(
          eq(subscriptionMemberships.planId, plan.id),
          eq(subscriptionMemberships.accessType, 'paid'),
          inArray(subscriptionMemberships.status, ['active', 'trialing', 'past_due']),
        ))
        .all()

      for (const membership of paidMemberships) {
        if (!membership.providerSubscriptionId) continue
        queries.push(
          db
            .insert(membershipPlanTransitions)
            .values({
              planId: plan.id,
              membershipId: membership.id,
              providerSubscriptionId: membership.providerSubscriptionId,
            })
            .onConflictDoNothing(),
        )
      }
    }

    try {
      await db.batch(queries as unknown as Parameters<Db['batch']>[0])
    } catch (error) {
      if (createdPrices.length > 0) {
        const provider = createPaymentProvider(c.env)
        await Promise.allSettled(createdPrices.map((price) => provider.archivePrice(price.providerPriceId)))
      }
      throw error
    }

    if (pricesToArchive.length > 0) {
      const provider = createPaymentProvider(c.env)
      const results = await Promise.allSettled(pricesToArchive.map((price) => provider.archivePrice(price.providerPriceId)))
      results.forEach((result, index) => {
        if (result.status !== 'rejected') return
        console.error(JSON.stringify({
          event: 'stripe_price_archive_failed',
          providerPriceId: pricesToArchive[index]?.providerPriceId,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        }))
      })
    }

    const updated = await getPlanByCreator(db, c.var.user.id)
    const prices = updated ? await getActivePrices(db, updated.id) : []
    return c.json({ plan: serializePlan(updated, prices) })
  },
)

// ── Subscription options and actions ───────────────────────────────────────

paymentsRoutes.get(
  '/profile/:username/options',
  authMiddleware,
  zValidator('param', subscriptionOptionsParamSchema, zodHook),
  async (c) => {
    const { username } = c.req.valid('param')
    const db = createDb(c.env.DB)
    await expireDueMembershipTrials(db)
    const creator = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: users.role,
        accountStatus: users.accountStatus,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()

    if (!creator || creator.role !== 'creator' || creator.accountStatus !== 'active') {
      return notFound(c, 'Creator not found')
    }

    const plan = await getPlanByCreator(db, creator.id)
    const prices = plan ? await getActivePrices(db, plan.id) : []
    const membership = await db
      .select()
      .from(subscriptionMemberships)
      .where(and(
        eq(subscriptionMemberships.creatorId, creator.id),
        eq(subscriptionMemberships.subscriberId, c.var.user.id),
      ))
      .get()

    const trialClaim = plan?.mode === 'free_trial'
      ? await db
          .select({ creatorId: membershipTrialClaims.creatorId })
          .from(membershipTrialClaims)
          .where(and(
            eq(membershipTrialClaims.creatorId, creator.id),
            eq(membershipTrialClaims.subscriberId, c.var.user.id),
          ))
          .get()
      : undefined

    return c.json({
      creator: {
        id: creator.id,
        displayName: creator.displayName,
        username: creator.username,
        avatarUrl: creator.avatarUrl,
      },
      plan: serializePlan(plan, prices),
      viewerMembership: membership ? serializeMembership(membership) : null,
      trialAvailable: plan?.mode === 'free_trial' && !trialClaim,
    })
  },
)

paymentsRoutes.post('/subscribe', authMiddleware, zValidator('json', membershipSubscribeSchema, zodHook), async (c) => {
  const { creatorId, interval } = c.req.valid('json')
  const subscriberId = c.var.user.id
  if (creatorId === subscriberId) return conflict(c, 'You cannot subscribe to yourself')

  const db = createDb(c.env.DB)
  await expireDueMembershipTrials(db)
  const [creator, subscriber, plan] = await Promise.all([
    getCreatorById(db, creatorId),
    getCurrentUser(db, subscriberId),
    getPlanByCreator(db, creatorId),
  ])
  if (!creator || creator.role !== 'creator' || creator.accountStatus !== 'active') return notFound(c, 'Creator not found')
  if (!subscriber || subscriber.accountStatus !== 'active') return forbidden(c, 'Your account is not active')
  if (!plan || plan.mode === 'disabled') return forbidden(c, 'This creator is not accepting memberships')

  const existing = await db
    .select()
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, creatorId),
      eq(subscriptionMemberships.subscriberId, subscriberId),
    ))
    .get()

  if (isMembershipEntitled(existing)) {
    return conflict(c, 'You already have access to this creator')
  }

  if (plan.mode === 'free_permanent' || plan.mode === 'free_trial') {
    if (interval !== undefined) return badRequest(c, 'Billing interval is only valid for paid memberships')
    const isTrial = plan.mode === 'free_trial'
    const status = isTrial ? 'trialing' as const : 'active' as const
    const accessType = isTrial ? 'trial' as const : 'free' as const
    const membershipId = existing?.id ?? crypto.randomUUID()
    const trialEndsAt = isTrial ? nowSeconds() + (plan.freeTrialDays ?? 7) * 24 * 60 * 60 : null

    if (isTrial) {
      const claimed = await db
        .select({ creatorId: membershipTrialClaims.creatorId })
        .from(membershipTrialClaims)
        .where(and(
          eq(membershipTrialClaims.creatorId, creatorId),
          eq(membershipTrialClaims.subscriberId, subscriberId),
        ))
        .get()
      if (claimed) return conflict(c, 'This free trial has already been used')
    }

    const membershipQuery = db
      .insert(subscriptionMemberships)
      .values({
        id: membershipId,
        creatorId,
        subscriberId,
        planId: plan.id,
        planPriceId: null,
        provider: 'internal',
        accessType,
        status,
        trialEndsAt,
      })
      .onConflictDoUpdate({
        target: [subscriptionMemberships.subscriberId, subscriptionMemberships.creatorId],
        set: {
          planId: plan.id,
          planPriceId: null,
          provider: 'internal',
          accessType,
          interval: null,
          status,
          providerSubscriptionId: null,
          providerCheckoutSessionId: null,
          providerCustomerId: null,
          providerEventCreatedAt: null,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          trialEndsAt,
          cancelAt: null,
          canceledAt: null,
          updatedAt: new Date(),
        },
      })

    const followQuery = db
      .insert(follows)
      .values({ followerId: subscriberId, followeeId: creatorId })
      .onConflictDoNothing()

    try {
      if (isTrial && trialEndsAt) {
        await db.batch([
          db.insert(membershipTrialClaims).values({
            creatorId,
            subscriberId,
            planId: plan.id,
            startedAt: nowSeconds(),
            endsAt: trialEndsAt,
          }),
          membershipQuery,
          followQuery,
        ])
      } else {
        await db.batch([membershipQuery, followQuery])
      }
    } catch (error) {
      if (isTrial && error instanceof Error && error.message.toLowerCase().includes('unique')) {
        return conflict(c, 'This free trial has already been used')
      }
      throw error
    }

    const membership = await db.select().from(subscriptionMemberships).where(eq(subscriptionMemberships.id, membershipId)).get()
    if (!membership) throw new Error('Membership was not created')
    await notifyMembershipActivated(db, c.env, {
      creatorId,
      subscriberId,
      membershipId,
      accessType,
      status,
      dedupeKey: `membership:${membershipId}:${status}:${accessType}`,
    }, new URL(c.req.url).origin)

    return c.json({ kind: 'membership', membership: serializeMembership(membership) }, 201)
  }

  if (!interval) return badRequest(c, 'Choose monthly or yearly billing')
  const [price, account] = await Promise.all([
    db
      .select()
      .from(membershipPlanPrices)
      .where(and(
        eq(membershipPlanPrices.planId, plan.id),
        eq(membershipPlanPrices.interval, interval),
        eq(membershipPlanPrices.provider, 'stripe'),
        eq(membershipPlanPrices.active, true),
      ))
      .get(),
    db.select().from(creatorPaymentAccounts).where(eq(creatorPaymentAccounts.creatorId, creatorId)).get(),
  ])
  if (!price) return notFound(c, 'Selected billing interval is not available')
  if (!canUsePaid(account)) return paymentSetupRequired(c, 'Creator Stripe Sandbox onboarding is incomplete')

  try {
    const provider = createPaymentProvider(c.env)
    await provider.verifySandboxConfiguration()
    const customer = await getOrCreatePaymentCustomer(db, provider, subscriberId)
    const membershipId = existing?.id ?? crypto.randomUUID()

    await db
      .insert(subscriptionMemberships)
      .values({
        id: membershipId,
        creatorId,
        subscriberId,
        planId: plan.id,
        planPriceId: price.id,
        provider: 'stripe',
        accessType: 'paid',
        interval,
        status: 'pending',
        providerCustomerId: customer.providerCustomerId,
      })
      .onConflictDoUpdate({
        target: [subscriptionMemberships.subscriberId, subscriptionMemberships.creatorId],
        set: {
          planId: plan.id,
          planPriceId: price.id,
          provider: 'stripe',
          accessType: 'paid',
          interval,
          status: 'pending',
          providerCustomerId: customer.providerCustomerId,
          providerSubscriptionId: null,
          providerCheckoutSessionId: null,
          providerEventCreatedAt: null,
          trialEndsAt: null,
          cancelAt: null,
          canceledAt: null,
          updatedAt: new Date(),
        },
      })
      .run()

    const origin = new URL(c.req.url).origin
    const session = await provider.createCheckoutSession({
      membershipId,
      creatorId,
      subscriberId,
      customerId: customer.providerCustomerId,
      connectedAccountId: account?.providerAccountId ?? '',
      priceId: price.providerPriceId,
      planPriceId: price.id,
      interval,
      platformFeeBps: getPlatformFeeBps(c.env),
      idempotencyKey: `zenith-checkout-${membershipId}-${price.id}`,
      successUrl: `${origin}/u/${creator.username}?subscription=success`,
      cancelUrl: `${origin}/u/${creator.username}?subscription=cancelled`,
    })

    if (!session.url) return badRequest(c, 'Stripe did not return a Checkout URL')
    await db
      .update(subscriptionMemberships)
      .set({
        providerCheckoutSessionId: session.id,
        providerSubscriptionId: session.subscriptionId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionMemberships.id, membershipId))
      .run()

    return c.json({ kind: 'checkout', url: session.url, membershipId, sandbox: true }, 201)
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

paymentsRoutes.post('/portal', authMiddleware, zValidator('json', customerPortalSchema, zodHook), async (c) => {
  const { creatorId } = c.req.valid('json')
  const db = createDb(c.env.DB)
  const membership = await db
    .select()
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, creatorId),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
    ))
    .get()

  if (!membership || membership.accessType !== 'paid' || !membership.providerCustomerId) {
    return notFound(c, 'Paid membership not found')
  }

  try {
    const creator = await getCreatorById(db, creatorId)
    const origin = new URL(c.req.url).origin
    const portal = await createPaymentProvider(c.env).createCustomerPortalSession({
      customerId: membership.providerCustomerId,
      returnUrl: `${origin}/u/${creator?.username ?? ''}`,
    })
    return c.json({ url: portal.url, sandbox: true })
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

paymentsRoutes.delete('/memberships/:creatorId', authMiddleware, async (c) => {
  const creatorId = c.req.param('creatorId')
  const db = createDb(c.env.DB)
  const membership = await db
    .select()
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, creatorId),
      eq(subscriptionMemberships.subscriberId, c.var.user.id),
    ))
    .get()
  if (!membership) return c.body(null, 204)
  if (membership.accessType === 'paid') {
    return errorResponse(c, 409, 'billing_portal_required', 'Manage paid membership cancellation in Stripe Sandbox')
  }

  await db
    .update(subscriptionMemberships)
    .set({ status: 'canceled', canceledAt: nowSeconds(), updatedAt: new Date() })
    .where(eq(subscriptionMemberships.id, membership.id))
    .run()
  return c.body(null, 204)
})

async function getOrCreatePaymentCustomer(
  db: Db,
  provider: ReturnType<typeof createPaymentProvider>,
  userId: string,
) {
  const existing = await db
    .select()
    .from(paymentCustomers)
    .where(and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.provider, provider.name)))
    .get()
  if (existing) return existing

  const customer = await provider.createCustomer({ userId })
  await db
    .insert(paymentCustomers)
    .values({ userId, provider: provider.name, providerCustomerId: customer.id })
    .onConflictDoNothing()
    .run()

  const created = await db
    .select()
    .from(paymentCustomers)
    .where(and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.provider, provider.name)))
    .get()
  if (!created) throw new Error('Failed to create payment customer')
  return created
}

// ── Creator analytics and payouts ──────────────────────────────────────

paymentsRoutes.get('/creator/analytics', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const creatorId = c.var.user.id
  await expireDueMembershipTrials(db)
  const [account, memberships, revenueRows] = await Promise.all([
    db.select().from(creatorPaymentAccounts).where(eq(creatorPaymentAccounts.creatorId, creatorId)).get(),
    db
      .select({
        id: subscriptionMemberships.id,
        status: subscriptionMemberships.status,
        accessType: subscriptionMemberships.accessType,
        interval: subscriptionMemberships.interval,
        provider: subscriptionMemberships.provider,
        trialEndsAt: subscriptionMemberships.trialEndsAt,
        currentPeriodEnd: subscriptionMemberships.currentPeriodEnd,
        priceAmountCents: membershipPlanPrices.amountCents,
        subscriberDisplayName: users.displayName,
        subscriberUsername: users.username,
        subscriberEmail: users.email,
      })
      .from(subscriptionMemberships)
      .innerJoin(users, eq(users.id, subscriptionMemberships.subscriberId))
      .leftJoin(membershipPlanPrices, eq(membershipPlanPrices.id, subscriptionMemberships.planPriceId))
      .where(eq(subscriptionMemberships.creatorId, creatorId))
      .orderBy(desc(subscriptionMemberships.createdAt))
      .all(),
    db
      .select()
      .from(revenueEvents)
      .where(eq(revenueEvents.creatorId, creatorId))
      .orderBy(desc(revenueEvents.occurredAt))
      .all(),
  ])

  let balance = { availableCents: 0, pendingCents: 0, currency: 'usd' }
  let payouts: Array<{ id: string; amountCents: number; currency: string; status: string; arrivalDate: number | null; createdAt: number }> = []
  if (account) {
    try {
      const provider = createPaymentProvider(c.env)
      balance = await provider.retrieveBalance(account.providerAccountId)
      payouts = await provider.listPayouts(account.providerAccountId)
    } catch (error) {
      if (!isPaymentConfigError(error)) console.error(error)
    }
  }

  const activeMembers = memberships.filter(isMembershipEntitled)
  const paidMembers = activeMembers.filter((membership) => membership.accessType === 'paid')
  const freeMembers = activeMembers.filter((membership) => membership.accessType === 'free')
  const trialMembers = activeMembers.filter((membership) => membership.accessType === 'trial')
  const mrrCents = paidMembers.reduce((sum, member) => {
    const amount = member.priceAmountCents ?? 0
    return sum + (member.interval === 'yearly' ? Math.round(amount / 12) : amount)
  }, 0)
  const totalGrossCents = revenueRows.reduce((sum, row) => sum + row.amountGrossCents, 0)
  const totalNetCents = revenueRows.reduce((sum, row) => sum + row.amountNetCents, 0)

  return c.json({
    account: accountStatusFromRow(account),
    sandbox: true,
    balance,
    payouts,
    metrics: {
      mrrCents,
      totalGrossCents,
      totalNetCents,
      paidSubscribers: paidMembers.length,
      freeSubscribers: freeMembers.length,
      trialSubscribers: trialMembers.length,
      activeSubscribers: activeMembers.length,
    },
    chart: buildRevenueChart(revenueRows),
    subscribers: memberships.map((membership) => ({
      id: membership.id,
      displayName: membership.subscriberDisplayName,
      username: membership.subscriberUsername,
      email: membership.subscriberEmail,
      provider: membership.provider,
      accessType: membership.accessType,
      interval: membership.interval,
      status: membership.status,
      trialEndsAt: membership.trialEndsAt,
      currentPeriodEnd: membership.currentPeriodEnd,
      paying: membership.accessType === 'paid' && isMembershipEntitled(membership),
    })),
  })
})

function buildRevenueChart(rows: Array<{ occurredAt: number; amountNetCents: number; amountGrossCents: number }>) {
  const days: Array<{ date: string; netCents: number; grossCents: number }> = []
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date(today)
    date.setUTCDate(today.getUTCDate() - index)
    days.push({ date: date.toISOString().slice(0, 10), netCents: 0, grossCents: 0 })
  }

  const byDate = new Map(days.map((day) => [day.date, day]))
  for (const row of rows) {
    const date = new Date(row.occurredAt * 1000).toISOString().slice(0, 10)
    const bucket = byDate.get(date)
    if (!bucket) continue
    bucket.netCents += row.amountNetCents
    bucket.grossCents += row.amountGrossCents
  }
  return days
}

// ── Stripe webhook ──────────────────────────────────────────────────────────

paymentsRoutes.post('/webhook', async (c) => {
  const signature = c.req.header('stripe-signature')
  if (!signature) return badRequest(c, 'Missing Stripe signature')

  let event: Stripe.Event
  const payload = await c.req.text()
  try {
    event = await constructStripeWebhookEvent(c.env, payload, signature, getStripeWebhookSecret(c.env))
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    return badRequest(c, 'Invalid Stripe webhook signature')
  }
  if (event.livemode) {
    return errorResponse(c, 400, 'live_event_rejected', 'Zenith only accepts Stripe Sandbox webhook events')
  }

  const db = createDb(c.env.DB)
  const claim = await claimWebhookEvent(db, event)
  if (!claim) return c.json({ received: true, duplicate: true })

  try {
    await handleStripeEvent(db, c.env, event, getPlatformFeeBps(c.env), new URL(c.req.url).origin)
    await db
      .update(paymentWebhookEvents)
      .set({ status: 'completed', processedAt: nowSeconds(), claimedAt: null, lastError: null })
      .where(eq(paymentWebhookEvents.id, event.id))
      .run()
    return c.json({ received: true })
  } catch (error) {
    await db
      .update(paymentWebhookEvents)
      .set({
        status: 'failed',
        claimedAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown webhook error',
      })
      .where(eq(paymentWebhookEvents.id, event.id))
      .run()
    console.error(JSON.stringify({
      event: 'stripe_webhook_failed',
      stripeEventId: event.id,
      stripeEventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    }))
    throw error
  }
})

async function claimWebhookEvent(db: Db, event: Stripe.Event) {
  const now = nowSeconds()
  const inserted = await db
    .insert(paymentWebhookEvents)
    .values({
      id: event.id,
      provider: 'stripe',
      eventType: event.type,
      livemode: false,
      status: 'processing',
      eventCreatedAt: event.created,
      attempts: 1,
      claimedAt: now,
      processedAt: now,
    })
    .onConflictDoNothing()
    .run()
  if ((inserted.meta.changes ?? 0) === 1) return true

  const existing = await db.select().from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, event.id)).get()
  if (!existing || existing.status === 'completed') return false
  if (existing.status === 'processing' && (existing.claimedAt ?? now) > now - 5 * 60) return false

  const reclaimed = await db
    .update(paymentWebhookEvents)
    .set({
      status: 'processing',
      attempts: sql`${paymentWebhookEvents.attempts} + 1`,
      claimedAt: now,
      lastError: null,
    })
    .where(and(
      eq(paymentWebhookEvents.id, event.id),
      eq(paymentWebhookEvents.status, existing.status),
    ))
    .run()
  return (reclaimed.meta.changes ?? 0) === 1
}

async function handleStripeEvent(db: Db, env: Env, event: Stripe.Event, platformFeeBps: number, origin?: string) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      await handleCheckoutCompleted(db, env, event, event.data.object as Stripe.Checkout.Session, origin)
      break
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      await handleCheckoutExpired(db, event, event.data.object as Stripe.Checkout.Session)
      break
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChanged(db, env, event, event.data.object as Stripe.Subscription, origin)
      break
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(db, event, event.data.object as Stripe.Invoice, platformFeeBps)
      break
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(db, env, event, event.data.object as Stripe.Invoice, origin)
      break
    default:
      break
  }
}

function eventCanUpdateMembership(event: Stripe.Event) {
  return or(
    isNull(subscriptionMemberships.providerEventCreatedAt),
    lte(subscriptionMemberships.providerEventCreatedAt, event.created),
  )
}

async function handleCheckoutCompleted(
  db: Db,
  env: Env,
  event: Stripe.Event,
  session: Stripe.Checkout.Session,
  origin?: string,
) {
  const membershipId = session.metadata?.membershipId
  if (!membershipId || (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required')) return

  await db
    .update(subscriptionMemberships)
    .set({
      status: 'active',
      providerCheckoutSessionId: session.id,
      providerSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
      providerCustomerId: typeof session.customer === 'string' ? session.customer : null,
      providerEventCreatedAt: event.created,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptionMemberships.id, membershipId), eventCanUpdateMembership(event)))
    .run()

  const membership = await db.select().from(subscriptionMemberships).where(eq(subscriptionMemberships.id, membershipId)).get()
  if (!membership || membership.providerCheckoutSessionId !== session.id) return
  await db.insert(follows).values({ followerId: membership.subscriberId, followeeId: membership.creatorId }).onConflictDoNothing().run()
  await notifyMembershipActivated(db, env, {
    creatorId: membership.creatorId,
    subscriberId: membership.subscriberId,
    membershipId: membership.id,
    accessType: membership.accessType,
    status: membership.status,
    dedupeKey: `checkout:${session.id}:membership:${membership.id}`,
  }, origin)
}

async function handleCheckoutExpired(db: Db, event: Stripe.Event, session: Stripe.Checkout.Session) {
  await db
    .update(subscriptionMemberships)
    .set({ status: 'canceled', providerEventCreatedAt: event.created, updatedAt: new Date() })
    .where(and(
      eq(subscriptionMemberships.providerCheckoutSessionId, session.id),
      eq(subscriptionMemberships.status, 'pending'),
      eventCanUpdateMembership(event),
    ))
    .run()
}

async function handleSubscriptionChanged(
  db: Db,
  env: Env,
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  origin?: string,
) {
  const membershipId = subscription.metadata?.membershipId
  const where = membershipId
    ? eq(subscriptionMemberships.id, membershipId)
    : eq(subscriptionMemberships.providerSubscriptionId, subscription.id)
  const existing = await db.select().from(subscriptionMemberships).where(where).get()
  if (!existing || (existing.providerEventCreatedAt ?? 0) > event.created) return

  const period = subscriptionPeriod(subscription)
  const status = stripeStatusToMembershipStatus(subscription.status)
  await db
    .update(subscriptionMemberships)
    .set({
      status,
      providerSubscriptionId: subscription.id,
      providerCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      providerEventCreatedAt: event.created,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      trialEndsAt: null,
      cancelAt: subscription.cancel_at ?? (subscription.cancel_at_period_end ? period.currentPeriodEnd : null),
      canceledAt: subscription.canceled_at,
      updatedAt: new Date(),
    })
    .where(and(where, eventCanUpdateMembership(event)))
    .run()

  if (existing.status === status || status === 'active' || status === 'trialing') return
  await notifySubscriptionStatusChanged(db, env, {
    creatorId: existing.creatorId,
    subscriberId: existing.subscriberId,
    membershipId: existing.id,
    status,
    dedupeKey: `subscription-status:${subscription.id}:${status}:${event.created}`,
  }, origin)
}

async function handleInvoicePaid(db: Db, event: Stripe.Event, invoice: Stripe.Invoice, platformFeeBps: number) {
  const membershipId = invoice.parent?.subscription_details?.metadata?.membershipId
  if (!membershipId || !invoice.id || invoice.amount_paid <= 0) return
  const membership = await db.select().from(subscriptionMemberships).where(eq(subscriptionMemberships.id, membershipId)).get()
  if (!membership) return

  const amountFeeCents = Math.round(invoice.amount_paid * (platformFeeBps / 10_000))
  await db
    .insert(revenueEvents)
    .values({
      creatorId: membership.creatorId,
      subscriberId: membership.subscriberId,
      membershipId: membership.id,
      provider: 'stripe',
      providerEventId: event.id,
      providerInvoiceId: invoice.id,
      amountGrossCents: invoice.amount_paid,
      amountFeeCents,
      amountNetCents: invoice.amount_paid - amountFeeCents,
      currency: invoice.currency ?? 'usd',
      occurredAt: event.created,
    })
    .onConflictDoNothing()
    .run()
}

async function handleInvoicePaymentFailed(
  db: Db,
  env: Env,
  event: Stripe.Event,
  invoice: Stripe.Invoice,
  origin?: string,
) {
  const membershipId = invoice.parent?.subscription_details?.metadata?.membershipId
  if (!membershipId) return
  const membership = await db.select().from(subscriptionMemberships).where(eq(subscriptionMemberships.id, membershipId)).get()
  if (!membership || (membership.providerEventCreatedAt ?? 0) > event.created) return

  await db
    .update(subscriptionMemberships)
    .set({ status: 'past_due', providerEventCreatedAt: event.created, updatedAt: new Date() })
    .where(and(eq(subscriptionMemberships.id, membershipId), eventCanUpdateMembership(event)))
    .run()
  await notifySubscriptionStatusChanged(db, env, {
    creatorId: membership.creatorId,
    subscriberId: membership.subscriberId,
    membershipId: membership.id,
    status: 'past_due',
    dedupeKey: `invoice-payment-failed:${invoice.id ?? membership.id}`,
  }, origin)
}

export const paymentRouteInternals = {
  stripeStatusToMembershipStatus,
  buildRevenueChart,
  serializePlan,
}
