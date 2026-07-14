import { describe, expect, it } from 'vitest'
import { paymentRouteInternals } from './payments'
import { creatorPlanUpdateSchema } from '../lib/schemas'
import { getStripeApiKey, getStripeSandboxConfiguration } from '../lib/payments'
import { isMembershipEntitled } from '../lib/memberships'

describe('payment route internals', () => {
  it('maps Stripe subscription statuses to entitlement statuses', () => {
    expect(paymentRouteInternals.stripeStatusToMembershipStatus('active')).toBe('active')
    expect(paymentRouteInternals.stripeStatusToMembershipStatus('trialing')).toBe('trialing')
    expect(paymentRouteInternals.stripeStatusToMembershipStatus('past_due')).toBe('past_due')
    expect(paymentRouteInternals.stripeStatusToMembershipStatus('incomplete_expired')).toBe('expired')
    expect(paymentRouteInternals.stripeStatusToMembershipStatus('canceled')).toBe('canceled')
  })

  it('builds a 30-day revenue chart and buckets revenue by UTC date', () => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const todaySeconds = Math.floor(today.getTime() / 1000)

    const chart = paymentRouteInternals.buildRevenueChart([
      { occurredAt: todaySeconds, amountNetCents: 900, amountGrossCents: 1000 },
      { occurredAt: todaySeconds + 3600, amountNetCents: 450, amountGrossCents: 500 },
    ])

    expect(chart).toHaveLength(30)
    expect(chart.at(-1)).toMatchObject({
      date: today.toISOString().slice(0, 10),
      netCents: 1350,
      grossCents: 1500,
    })
  })

  it('accepts exactly one membership mode and rejects irrelevant fields', () => {
    expect(creatorPlanUpdateSchema.safeParse({
      name: 'Members',
      mode: 'free_trial',
      freeTrialDays: 7,
    }).success).toBe(true)
    expect(creatorPlanUpdateSchema.safeParse({
      name: 'Members',
      mode: 'free_trial',
      freeTrialDays: 7,
      monthlyAmountCents: 900,
    }).success).toBe(false)
    expect(creatorPlanUpdateSchema.safeParse({
      name: 'Members',
      mode: 'paid',
      monthlyAmountCents: 900,
    }).success).toBe(true)
    expect(creatorPlanUpdateSchema.safeParse({
      name: 'Members',
      mode: 'paid',
      freeTrialDays: 7,
      monthlyAmountCents: 900,
    }).success).toBe(false)
  })

  it('grants active and unexpired trial access only', () => {
    expect(isMembershipEntitled({ status: 'active', trialEndsAt: null }, 100)).toBe(true)
    expect(isMembershipEntitled({ status: 'trialing', trialEndsAt: 101 }, 100)).toBe(true)
    expect(isMembershipEntitled({ status: 'trialing', trialEndsAt: 100 }, 100)).toBe(false)
    expect(isMembershipEntitled({ status: 'past_due', trialEndsAt: null }, 100)).toBe(false)
  })

  it('rejects live Stripe keys and incomplete sandbox configuration', () => {
    expect(() => getStripeApiKey({ STRIPE_API_KEY: 'sk_live_secret' } as unknown as Env)).toThrow(/sandbox/i)
    expect(() => getStripeSandboxConfiguration({
      STRIPE_API_KEY: 'sk_test_secret',
      STRIPE_WEBHOOK_SECRET: 'whsec_test',
      STRIPE_MODE: 'test',
      STRIPE_ACCOUNT_ID: 'acct_test',
    } as unknown as Env)).not.toThrow()
  })
})
