import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { createDb, type Db } from '../db/client'
import {
  creatorPaymentAccounts,
  follows,
  membershipPlanPrices,
  membershipPlans,
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
  checkoutSubscribeSchema,
  creatorPlanUpdateSchema,
  freeSubscribeSchema,
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
import type { ConnectedAccountSnapshot } from '../lib/payments/types'
import {
  notifyMembershipActivated,
  notifySubscriptionStatusChanged,
} from '../lib/notifications'

export const paymentsRoutes = new Hono<HonoEnv>()

const ACTIVE_MEMBERSHIP_STATUSES = ['active', 'trialing'] as const

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function addDaysAsUnix(days: number) {
  return nowSeconds() + days * 24 * 60 * 60
}

function isPaymentConfigError(error: unknown) {
  return error instanceof PaymentConfigurationError
}

function paymentSetupRequired(c: Parameters<typeof errorResponse>[0], message: string) {
  return errorResponse(c, 409, 'payment_setup_required', message)
}

function stripeUnavailable(c: Parameters<typeof errorResponse>[0]) {
  return errorResponse(c, 503, 'payment_provider_unconfigured', 'Stripe test mode is not configured')
}

function accountStatusFromSnapshot(snapshot: ConnectedAccountSnapshot) {
  return {
    provider: snapshot.provider,
    providerAccountId: snapshot.providerAccountId,
    status: snapshot.status,
    chargesEnabled: snapshot.chargesEnabled,
    payoutsEnabled: snapshot.payoutsEnabled,
    detailsSubmitted: snapshot.detailsSubmitted,
    requirementsDue: snapshot.requirementsDue,
    connected: snapshot.status === 'active',
  }
}

function accountStatusFromRow(row: CreatorPaymentAccount | undefined) {
  if (!row) {
    return {
      provider: 'stripe',
      providerAccountId: null,
      status: 'not_connected',
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      requirementsDue: [],
      connected: false,
    }
  }

  return {
    provider: row.provider,
    providerAccountId: row.providerAccountId,
    status: row.status,
    chargesEnabled: row.chargesEnabled,
    payoutsEnabled: row.payoutsEnabled,
    detailsSubmitted: row.detailsSubmitted,
    requirementsDue: parseJsonArray(row.requirementsDue),
    connected: row.status === 'active',
  }
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

async function upsertPaymentAccount(db: Db, creatorId: string, snapshot: ConnectedAccountSnapshot) {
  const values = {
    creatorId,
    provider: snapshot.provider,
    providerAccountId: snapshot.providerAccountId,
    status: snapshot.status,
    chargesEnabled: snapshot.chargesEnabled,
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
        chargesEnabled: values.chargesEnabled,
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
      email: users.email,
      displayName: users.displayName,
      username: users.username,
      role: users.role,
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
    currency: plan?.currency ?? 'usd',
    paidEnabled: Boolean(plan?.paidEnabled),
    freePermanentEnabled: Boolean(plan?.freePermanentEnabled),
    freeTrialEnabled: Boolean(plan?.freeTrialEnabled),
    freeTrialDays: plan?.freeTrialDays ?? null,
    prices: {
      monthly: monthly
        ? {
            amountCents: monthly.amountCents,
            providerPriceId: monthly.providerPriceId,
          }
        : null,
      yearly: yearly
        ? {
            amountCents: yearly.amountCents,
            providerPriceId: yearly.providerPriceId,
          }
        : null,
    },
  }
}

function canUsePaid(account: CreatorPaymentAccount | undefined) {
  return Boolean(account?.status === 'active' && account.chargesEnabled && account.payoutsEnabled)
}

function isCurrentlyEntitled(membership: SubscriptionMembership | undefined) {
  if (!membership) return false
  if (membership.status === 'active') return true
  return membership.status === 'trialing' && (membership.trialEndsAt ?? 0) > nowSeconds()
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

// ── Creator payment account ────────────────────────────────────────────────

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
    const existing = await db
      .select()
      .from(creatorPaymentAccounts)
      .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
      .get()

    const snapshot = existing
      ? await provider.retrieveConnectedAccount(existing.providerAccountId)
      : await provider.createConnectedAccount({
          creatorId: user.id,
          email: user.email,
          displayName: user.displayName,
        })

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

  if (!account) return paymentSetupRequired(c, 'Connect Stripe before opening the payout dashboard')

  try {
    const link = await createPaymentProvider(c.env).createDashboardLink(account.providerAccountId)
    return c.json({ url: link.url })
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

// ── Creator plan ───────────────────────────────────────────────────────────

paymentsRoutes.get('/creator/plan', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const [plan, account] = await Promise.all([
    getPlanByCreator(db, c.var.user.id),
    db.select().from(creatorPaymentAccounts).where(eq(creatorPaymentAccounts.creatorId, c.var.user.id)).get(),
  ])
  const prices = plan ? await getActivePrices(db, plan.id) : []

  return c.json({
    plan: serializePlan(plan, prices),
    account: accountStatusFromRow(account),
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

    const account = await db
      .select()
      .from(creatorPaymentAccounts)
      .where(eq(creatorPaymentAccounts.creatorId, c.var.user.id))
      .get()

    if (input.paidEnabled && !canUsePaid(account)) {
      return paymentSetupRequired(c, 'Complete Stripe onboarding before enabling paid subscriptions')
    }

    const plan = await getOrCreatePlan(db, c.var.user.id)
    const existingPrices = await getActivePrices(db, plan.id)
    const monthly = existingPrices.find((price) => price.interval === 'monthly')
    const yearly = existingPrices.find((price) => price.interval === 'yearly')
    const shouldCreateStripePrices =
      input.paidEnabled &&
      (monthly?.amountCents !== input.monthlyAmountCents || yearly?.amountCents !== input.yearlyAmountCents)

    await db
      .update(membershipPlans)
      .set({
        name: input.name,
        description: input.description ?? null,
        paidEnabled: input.paidEnabled,
        freePermanentEnabled: input.freePermanentEnabled,
        freeTrialEnabled: input.freeTrialEnabled,
        freeTrialDays: input.freeTrialEnabled ? input.freeTrialDays ?? null : null,
        currency: 'usd',
        updatedAt: new Date(),
      })
      .where(eq(membershipPlans.id, plan.id))
      .run()

    if (!input.paidEnabled) {
      await db
        .update(membershipPlanPrices)
        .set({ active: false, updatedAt: new Date() })
        .where(eq(membershipPlanPrices.planId, plan.id))
        .run()
    }

    if (shouldCreateStripePrices) {
      try {
        const providerPrices = await createPaymentProvider(c.env).createPrices({
          creatorId: user.id,
          displayName: user.displayName,
          planName: input.name,
          description: input.description,
          monthlyAmountCents: input.monthlyAmountCents ?? 0,
          yearlyAmountCents: input.yearlyAmountCents ?? 0,
          currency: 'usd',
        })

        await db
          .update(membershipPlanPrices)
          .set({ active: false, updatedAt: new Date() })
          .where(eq(membershipPlanPrices.planId, plan.id))
          .run()

        await db
          .insert(membershipPlanPrices)
          .values(providerPrices.map((price) => ({
            planId: plan.id,
            creatorId: user.id,
            provider: 'stripe' as const,
            interval: price.interval,
            amountCents: price.amountCents,
            currency: price.currency,
            providerProductId: price.providerProductId,
            providerPriceId: price.providerPriceId,
          })))
          .run()
      } catch (error) {
        if (isPaymentConfigError(error)) return stripeUnavailable(c)
        console.error(error)
        throw error
      }
    }

    const updated = await getPlanByCreator(db, c.var.user.id)
    const prices = updated ? await getActivePrices(db, updated.id) : []
    return c.json({ plan: serializePlan(updated, prices) })
  },
)

// ── Public subscription options and subscribe actions ──────────────────────

paymentsRoutes.get(
  '/profile/:username/options',
  authMiddleware,
  zValidator('param', subscriptionOptionsParamSchema, zodHook),
  async (c) => {
    const { username } = c.req.valid('param')
    const db = createDb(c.env.DB)
    const creator = await db
      .select({
        id: users.id,
        displayName: users.displayName,
        username: users.username,
        avatarUrl: users.avatarUrl,
        role: users.role,
      })
      .from(users)
      .where(eq(users.username, username))
      .get()

    if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

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

    return c.json({
      creator: {
        id: creator.id,
        displayName: creator.displayName,
        username: creator.username,
        avatarUrl: creator.avatarUrl,
      },
      plan: serializePlan(plan, prices),
      viewerMembership: membership
        ? {
            id: membership.id,
            status: membership.status,
            accessType: membership.accessType,
            interval: membership.interval,
            trialEndsAt: membership.trialEndsAt,
            entitled: isCurrentlyEntitled(membership),
          }
        : null,
    })
  },
)

paymentsRoutes.post('/subscribe/free', authMiddleware, zValidator('json', freeSubscribeSchema, zodHook), async (c) => {
  const { creatorId, kind } = c.req.valid('json')
  const subscriberId = c.var.user.id
  if (creatorId === subscriberId) return conflict(c, 'You cannot subscribe to yourself')

  const db = createDb(c.env.DB)
  const creator = await getCreatorById(db, creatorId)
  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')

  const plan = await getPlanByCreator(db, creatorId)
  if (!plan) return notFound(c, 'Creator subscription plan not found')
  if (kind === 'free' && !plan.freePermanentEnabled) return forbidden(c, 'Free subscription is not available')
  if (kind === 'trial' && !plan.freeTrialEnabled) return forbidden(c, 'Free trial is not available')

  const existing = await db
    .select()
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, creatorId),
      eq(subscriptionMemberships.subscriberId, subscriberId),
    ))
    .get()

  if (isCurrentlyEntitled(existing) && existing?.accessType === 'paid') {
    return conflict(c, 'You already have a paid subscription to this creator')
  }

  const status = kind === 'trial' ? 'trialing' : 'active'
  const membershipId = existing?.id ?? crypto.randomUUID()
  const trialEndsAt = kind === 'trial' ? addDaysAsUnix(plan.freeTrialDays ?? 7) : null

  await db
    .insert(subscriptionMemberships)
    .values({
      id: membershipId,
      creatorId,
      subscriberId,
      planId: plan.id,
      provider: 'internal',
      accessType: kind,
      status,
      trialEndsAt,
    })
    .onConflictDoUpdate({
      target: [subscriptionMemberships.subscriberId, subscriptionMemberships.creatorId],
      set: {
        planId: plan.id,
        provider: 'internal',
        accessType: kind,
        interval: null,
        status,
        providerSubscriptionId: null,
        providerCheckoutSessionId: null,
        providerCustomerId: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        trialEndsAt,
        cancelAt: null,
        canceledAt: null,
        updatedAt: new Date(),
      },
    })
    .run()

  await db
    .insert(follows)
    .values({ followerId: subscriberId, followeeId: creatorId })
    .onConflictDoNothing()
    .run()

  const membership = await db.select().from(subscriptionMemberships).where(eq(subscriptionMemberships.id, membershipId)).get()
  if (membership) {
    await notifyMembershipActivated(db, c.env, {
      creatorId,
      subscriberId,
      membershipId,
      accessType: kind,
      status,
      dedupeKey: `membership:${membershipId}:${status}:${kind}`,
    }, new URL(c.req.url).origin)
  }
  return c.json({
    membership: membership
      ? {
          id: membership.id,
          status: membership.status,
          accessType: membership.accessType,
          trialEndsAt: membership.trialEndsAt,
          entitled: isCurrentlyEntitled(membership),
        }
      : null,
  }, 201)
})

paymentsRoutes.post('/subscribe/checkout', authMiddleware, zValidator('json', checkoutSubscribeSchema, zodHook), async (c) => {
  const { creatorId, interval } = c.req.valid('json')
  const subscriberId = c.var.user.id
  if (creatorId === subscriberId) return conflict(c, 'You cannot subscribe to yourself')

  const db = createDb(c.env.DB)
  const [creator, subscriber] = await Promise.all([
    getCreatorById(db, creatorId),
    getCurrentUser(db, subscriberId),
  ])
  if (!creator || creator.role !== 'creator') return notFound(c, 'Creator not found')
  if (!subscriber) return notFound(c, 'Subscriber not found')

  const plan = await getPlanByCreator(db, creatorId)
  if (!plan || !plan.paidEnabled) return notFound(c, 'Paid subscriptions are not available')

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

  if (!price) return notFound(c, 'Selected subscription price is not available')
  if (!canUsePaid(account)) return paymentSetupRequired(c, 'Creator has not completed Stripe onboarding')

  const existing = await db
    .select()
    .from(subscriptionMemberships)
    .where(and(
      eq(subscriptionMemberships.creatorId, creatorId),
      eq(subscriptionMemberships.subscriberId, subscriberId),
    ))
    .get()

  if (isCurrentlyEntitled(existing) && existing?.accessType === 'paid') {
    return conflict(c, 'You already have an active paid subscription to this creator')
  }

  try {
    const provider = createPaymentProvider(c.env)
    const customer = await getOrCreatePaymentCustomer(db, provider, subscriber)
    const membershipId = existing?.id ?? crypto.randomUUID()

    await db
      .insert(subscriptionMemberships)
      .values({
        id: membershipId,
        creatorId,
        subscriberId,
        planId: plan.id,
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
          provider: 'stripe',
          accessType: 'paid',
          interval,
          status: 'pending',
          providerCustomerId: customer.providerCustomerId,
          providerSubscriptionId: null,
          providerCheckoutSessionId: null,
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
      interval,
      platformFeeBps: getPlatformFeeBps(c.env),
      successUrl: `${origin}/u/${creator.username}?subscription=success`,
      cancelUrl: `${origin}/u/${creator.username}?subscription=cancelled`,
    })

    if (!session.url) return badRequest(c, 'Stripe did not return a checkout URL')

    await db
      .update(subscriptionMemberships)
      .set({
        providerCheckoutSessionId: session.id,
        providerSubscriptionId: session.subscriptionId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptionMemberships.id, membershipId))
      .run()

    return c.json({ url: session.url, membershipId }, 201)
  } catch (error) {
    if (isPaymentConfigError(error)) return stripeUnavailable(c)
    console.error(error)
    throw error
  }
})

async function getOrCreatePaymentCustomer(
  db: Db,
  provider: ReturnType<typeof createPaymentProvider>,
  user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>,
) {
  const existing = await db
    .select()
    .from(paymentCustomers)
    .where(and(eq(paymentCustomers.userId, user.id), eq(paymentCustomers.provider, provider.name)))
    .get()

  if (existing) return existing

  const customer = await provider.createCustomer({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
  })

  await db
    .insert(paymentCustomers)
    .values({
      userId: user.id,
      provider: provider.name,
      providerCustomerId: customer.id,
    })
    .run()

  const created = await db
    .select()
    .from(paymentCustomers)
    .where(and(eq(paymentCustomers.userId, user.id), eq(paymentCustomers.provider, provider.name)))
    .get()
  if (!created) throw new Error('Failed to create payment customer')
  return created
}

// ── Creator analytics and payouts ──────────────────────────────────────────

paymentsRoutes.get('/creator/analytics', authMiddleware, requireRole('creator'), async (c) => {
  const db = createDb(c.env.DB)
  const creatorId = c.var.user.id
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
        subscriberDisplayName: users.displayName,
        subscriberUsername: users.username,
        subscriberEmail: users.email,
      })
      .from(subscriptionMemberships)
      .innerJoin(users, eq(users.id, subscriptionMemberships.subscriberId))
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

  const activeMembers = memberships.filter((membership) =>
    membership.status === 'active' || (membership.status === 'trialing' && (membership.trialEndsAt ?? 0) > nowSeconds()))
  const paidMembers = activeMembers.filter((membership) => membership.accessType === 'paid')
  const freeMembers = activeMembers.filter((membership) => membership.accessType === 'free')
  const trialMembers = activeMembers.filter((membership) => membership.accessType === 'trial')

  const activePrices = await db
    .select()
    .from(membershipPlanPrices)
    .where(and(eq(membershipPlanPrices.creatorId, creatorId), eq(membershipPlanPrices.active, true)))
    .all()
  const monthlyPrice = activePrices.find((price) => price.interval === 'monthly')?.amountCents ?? 0
  const yearlyPrice = activePrices.find((price) => price.interval === 'yearly')?.amountCents ?? 0
  const mrrCents = paidMembers.reduce((sum, member) => {
    if (member.interval === 'yearly') return sum + Math.round(yearlyPrice / 12)
    return sum + monthlyPrice
  }, 0)

  const totalGrossCents = revenueRows.reduce((sum, row) => sum + row.amountGrossCents, 0)
  const totalNetCents = revenueRows.reduce((sum, row) => sum + row.amountNetCents, 0)
  const chart = buildRevenueChart(revenueRows)

  return c.json({
    account: accountStatusFromRow(account),
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
    chart,
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
      paying: membership.accessType === 'paid' && ACTIVE_MEMBERSHIP_STATUSES.includes(membership.status as typeof ACTIVE_MEMBERSHIP_STATUSES[number]),
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

// ── Stripe webhook ─────────────────────────────────────────────────────────

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

  const db = createDb(c.env.DB)
  const duplicate = await db
    .select({ id: paymentWebhookEvents.id })
    .from(paymentWebhookEvents)
    .where(eq(paymentWebhookEvents.id, event.id))
    .get()
  if (duplicate) return c.json({ received: true, duplicate: true })

  await handleStripeEvent(db, c.env, event, getPlatformFeeBps(c.env), new URL(c.req.url).origin)
  await db
    .insert(paymentWebhookEvents)
    .values({ id: event.id, provider: 'stripe', eventType: event.type })
    .run()

  return c.json({ received: true })
})

async function handleStripeEvent(db: Db, env: Env, event: Stripe.Event, platformFeeBps: number, origin?: string) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(db, env, event.data.object as Stripe.Checkout.Session, origin)
      break
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionChanged(db, env, event.data.object as Stripe.Subscription, origin)
      break
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      await handleInvoicePaid(db, event, event.data.object as Stripe.Invoice, platformFeeBps)
      break
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(db, env, event.data.object as Stripe.Invoice, origin)
      break
    default:
      break
  }
}

async function handleCheckoutCompleted(db: Db, env: Env, session: Stripe.Checkout.Session, origin?: string) {
  const membershipId = session.metadata?.membershipId
  if (!membershipId) return

  await db
    .update(subscriptionMemberships)
    .set({
      status: 'active',
      providerCheckoutSessionId: session.id,
      providerSubscriptionId: typeof session.subscription === 'string' ? session.subscription : null,
      providerCustomerId: typeof session.customer === 'string' ? session.customer : null,
      updatedAt: new Date(),
    })
    .where(eq(subscriptionMemberships.id, membershipId))
    .run()

  const membership = await db
    .select()
    .from(subscriptionMemberships)
    .where(eq(subscriptionMemberships.id, membershipId))
    .get()
  if (!membership) return

  await notifyMembershipActivated(db, env, {
    creatorId: membership.creatorId,
    subscriberId: membership.subscriberId,
    membershipId: membership.id,
    accessType: membership.accessType,
    status: membership.status,
    dedupeKey: `checkout:${session.id}:membership:${membership.id}`,
  }, origin)
}

async function handleSubscriptionChanged(db: Db, env: Env, subscription: Stripe.Subscription, origin?: string) {
  const membershipId = subscription.metadata?.membershipId
  const period = subscriptionPeriod(subscription)
  const status = stripeStatusToMembershipStatus(subscription.status)
  const where = membershipId
    ? eq(subscriptionMemberships.id, membershipId)
    : eq(subscriptionMemberships.providerSubscriptionId, subscription.id)
  const existing = await db.select().from(subscriptionMemberships).where(where).get()

  await db
    .update(subscriptionMemberships)
    .set({
      status,
      providerSubscriptionId: subscription.id,
      providerCustomerId: typeof subscription.customer === 'string' ? subscription.customer : null,
      currentPeriodStart: period.currentPeriodStart,
      currentPeriodEnd: period.currentPeriodEnd,
      trialEndsAt: subscription.trial_end,
      cancelAt: subscription.cancel_at,
      canceledAt: subscription.canceled_at,
      updatedAt: new Date(),
    })
    .where(where)
    .run()

  if (!existing || existing.status === status) return
  if (status === 'active' || status === 'trialing') return

  await notifySubscriptionStatusChanged(db, env, {
    creatorId: existing.creatorId,
    subscriberId: existing.subscriberId,
    membershipId: existing.id,
    status,
    dedupeKey: `subscription-status:${subscription.id}:${status}`,
  }, origin)
}

async function handleInvoicePaid(db: Db, event: Stripe.Event, invoice: Stripe.Invoice, platformFeeBps: number) {
  const metadata = invoice.parent?.subscription_details?.metadata
  const membershipId = metadata?.membershipId
  if (!membershipId || !invoice.id) return

  const membership = await db
    .select()
    .from(subscriptionMemberships)
    .where(eq(subscriptionMemberships.id, membershipId))
    .get()
  if (!membership) return

  const amountGrossCents = invoice.amount_paid
  if (amountGrossCents <= 0) return

  const amountFeeCents = Math.round(amountGrossCents * (platformFeeBps / 10_000))
  const amountNetCents = amountGrossCents - amountFeeCents

  await db
    .insert(revenueEvents)
    .values({
      creatorId: membership.creatorId,
      subscriberId: membership.subscriberId,
      membershipId: membership.id,
      provider: 'stripe',
      providerEventId: event.id,
      providerInvoiceId: invoice.id,
      amountGrossCents,
      amountFeeCents,
      amountNetCents,
      currency: invoice.currency ?? 'usd',
      occurredAt: event.created,
    })
    .onConflictDoNothing()
    .run()
}

async function handleInvoicePaymentFailed(db: Db, env: Env, invoice: Stripe.Invoice, origin?: string) {
  const membershipId = invoice.parent?.subscription_details?.metadata?.membershipId
  if (!membershipId) return
  const membership = await db
    .select()
    .from(subscriptionMemberships)
    .where(eq(subscriptionMemberships.id, membershipId))
    .get()

  await db
    .update(subscriptionMemberships)
    .set({ status: 'past_due', updatedAt: new Date() })
    .where(eq(subscriptionMemberships.id, membershipId))
    .run()

  if (!membership) return
  await notifySubscriptionStatusChanged(db, env, {
    creatorId: membership.creatorId,
    subscriberId: membership.subscriberId,
    membershipId: membership.id,
    status: 'past_due',
    dedupeKey: `invoice-payment-failed:${invoice.id ?? membership.id}`,
  }, origin)
}

// Exported for focused route tests.
export const paymentRouteInternals = {
  stripeStatusToMembershipStatus,
  buildRevenueChart,
}
