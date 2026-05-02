import { queryOptions } from '@tanstack/react-query'
import { apiGetRequired, apiPostRequired, apiPutRequired } from './api'
import type { CreatorSubscriptionPlanFormValues } from './schemas'

export type ConnectedAccountStatus = 'not_connected' | 'onboarding' | 'active' | 'restricted'
export type MembershipInterval = 'monthly' | 'yearly'
export type MembershipStatus = 'pending' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'incomplete'
export type MembershipAccessType = 'free' | 'trial' | 'paid'

export type ConnectedAccount = {
  provider: 'stripe'
  providerAccountId: string | null
  status: ConnectedAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  connected: boolean
}

export type PlanPrice = {
  amountCents: number
  providerPriceId: string
}

export type CreatorMembershipPlan = {
  id: string | null
  name: string
  description: string
  currency: 'usd'
  paidEnabled: boolean
  freePermanentEnabled: boolean
  freeTrialEnabled: boolean
  freeTrialDays: number | null
  prices: {
    monthly: PlanPrice | null
    yearly: PlanPrice | null
  }
}

export type CreatorPlanResponse = {
  plan: CreatorMembershipPlan
  account: ConnectedAccount
}

export type ViewerMembership = {
  id: string
  status: MembershipStatus
  accessType: MembershipAccessType
  interval: MembershipInterval | null
  trialEndsAt: number | null
  entitled: boolean
}

export type SubscriptionOptionsResponse = {
  creator: {
    id: string
    displayName: string
    username: string
    avatarUrl: string | null
  }
  plan: CreatorMembershipPlan
  viewerMembership: ViewerMembership | null
}

export type CreatorAnalyticsResponse = {
  account: ConnectedAccount
  balance: {
    availableCents: number
    pendingCents: number
    currency: string
  }
  payouts: Array<{
    id: string
    amountCents: number
    currency: string
    status: string
    arrivalDate: number | null
    createdAt: number
  }>
  metrics: {
    mrrCents: number
    totalGrossCents: number
    totalNetCents: number
    paidSubscribers: number
    freeSubscribers: number
    trialSubscribers: number
    activeSubscribers: number
  }
  chart: Array<{
    date: string
    netCents: number
    grossCents: number
  }>
  subscribers: Array<{
    id: string
    displayName: string
    username: string
    email: string
    provider: 'internal' | 'stripe'
    accessType: MembershipAccessType
    interval: MembershipInterval | null
    status: MembershipStatus
    trialEndsAt: number | null
    currentPeriodEnd: number | null
    paying: boolean
  }>
}

export const paymentKeys = {
  creatorAccount: ['payments', 'creator', 'account'] as const,
  creatorPlan: ['payments', 'creator', 'plan'] as const,
  creatorAnalytics: ['payments', 'creator', 'analytics'] as const,
  subscriptionOptions: (username: string) => ['payments', 'profile', username, 'options'] as const,
}

export const creatorPlanQueryOptions = queryOptions({
  queryKey: paymentKeys.creatorPlan,
  queryFn: () => apiGetRequired<CreatorPlanResponse>('/api/payments/creator/plan'),
})

export const creatorAnalyticsQueryOptions = queryOptions({
  queryKey: paymentKeys.creatorAnalytics,
  queryFn: () => apiGetRequired<CreatorAnalyticsResponse>('/api/payments/creator/analytics'),
})

export function subscriptionOptionsQueryOptions(username: string, enabled: boolean) {
  return queryOptions({
    queryKey: paymentKeys.subscriptionOptions(username),
    queryFn: () => apiGetRequired<SubscriptionOptionsResponse>(`/api/payments/profile/${username}/options`),
    enabled,
  })
}

export function startCreatorOnboarding() {
  return apiPostRequired<{ account: ConnectedAccount; url: string }>('/api/payments/creator/onboarding')
}

export function openCreatorDashboard() {
  return apiPostRequired<{ url: string }>('/api/payments/creator/dashboard-link')
}

export function updateCreatorPlan(values: CreatorSubscriptionPlanFormValues) {
  return apiPutRequired<{ plan: CreatorMembershipPlan }>('/api/payments/creator/plan', {
    name: values.name,
    description: values.description || undefined,
    paidEnabled: values.paidEnabled,
    monthlyAmountCents: values.paidEnabled ? dollarsToCents(values.monthlyAmount) : undefined,
    yearlyAmountCents: values.paidEnabled ? dollarsToCents(values.yearlyAmount) : undefined,
    freePermanentEnabled: values.freePermanentEnabled,
    freeTrialEnabled: values.freeTrialEnabled,
    freeTrialDays: values.freeTrialEnabled ? values.freeTrialDays : undefined,
  })
}

export function subscribeFree(input: { creatorId: string; kind: 'free' | 'trial' }) {
  return apiPostRequired<{ membership: ViewerMembership | null }>('/api/payments/subscribe/free', input)
}

export function startCheckout(input: { creatorId: string; interval: MembershipInterval }) {
  return apiPostRequired<{ url: string; membershipId: string }>('/api/payments/subscribe/checkout', input)
}

export function dollarsFromCents(cents: number | null | undefined) {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

export function dollarsToCents(value: string | undefined) {
  return Math.round(Number(value ?? 0) * 100)
}

export function formatCurrency(cents: number | null | undefined, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format((cents ?? 0) / 100)
}

export function formatUnixDate(seconds: number | null | undefined) {
  if (!seconds) return 'Not set'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(seconds * 1000),
  )
}
