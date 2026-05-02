import { describe, expect, it } from 'vitest'
import { paymentRouteInternals } from './payments'

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
})
