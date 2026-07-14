import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiDelete, apiGetRequired, apiPostRequired, apiPutRequired } from './api'
import type { CreatorSubscriptionPlanFormValues } from './schemas'

export type ConnectedAccountStatus = 'not_connected' | 'onboarding' | 'active' | 'restricted'
export type MembershipInterval = 'monthly' | 'yearly'
export type MembershipStatus = 'pending' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'incomplete'
export type MembershipAccessType = 'free' | 'trial' | 'paid'
export type MembershipPlanMode = 'disabled' | 'free_permanent' | 'free_trial' | 'paid'

export type ConnectedAccount = {
  provider: 'stripe'
  providerAccountId: string | null
  status: ConnectedAccountStatus
  transfersEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  connected: boolean
  sandbox: true
}

export type PlanPrice = {
  id: string
  amountCents: number
  providerPriceId: string
}

export type CreatorMembershipPlan = {
  id: string | null
  name: string
  description: string
  currency: 'usd'
  mode: MembershipPlanMode
  revision: number
  freeTrialDays: number | null
  sandbox: true
  prices: {
    monthly: PlanPrice | null
    yearly: PlanPrice | null
  }
}

export type CreatorPlanResponse = {
  plan: CreatorMembershipPlan
  account: ConnectedAccount
  transitions: Partial<Record<'pending' | 'processing' | 'completed' | 'failed', number>>
}

export type ViewerMembership = {
  id: string
  status: MembershipStatus
  accessType: MembershipAccessType
  interval: MembershipInterval | null
  trialEndsAt: number | null
  currentPeriodEnd: number | null
  cancelAt: number | null
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
  trialAvailable: boolean
}

export type CreatorAnalyticsResponse = {
  account: ConnectedAccount
  sandbox: true
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
  const common = {
    name: values.name,
    description: values.description || undefined,
  }

  if (values.mode === 'free_trial') {
    return apiPutRequired<{ plan: CreatorMembershipPlan }>('/api/payments/creator/plan', {
      ...common,
      mode: values.mode,
      freeTrialDays: values.freeTrialDays,
    })
  }
  if (values.mode === 'paid') {
    return apiPutRequired<{ plan: CreatorMembershipPlan }>('/api/payments/creator/plan', {
      ...common,
      mode: values.mode,
      monthlyAmountCents: dollarsToCents(values.monthlyAmount),
      ...(values.yearlyAmount ? { yearlyAmountCents: dollarsToCents(values.yearlyAmount) } : {}),
    })
  }
  return apiPutRequired<{ plan: CreatorMembershipPlan }>('/api/payments/creator/plan', {
    ...common,
    mode: values.mode,
  })
}

export type MembershipSubscribeResult =
  | { kind: 'membership'; membership: ViewerMembership }
  | { kind: 'checkout'; url: string; membershipId: string; sandbox: true }

export function startMembership(input: { creatorId: string; interval?: MembershipInterval }) {
  return apiPostRequired<MembershipSubscribeResult>('/api/payments/subscribe', input)
}

export function openBillingPortal(creatorId: string) {
  return apiPostRequired<{ url: string; sandbox: true }>('/api/payments/portal', { creatorId })
}

export async function cancelFreeMembership(creatorId: string) {
  const response = await apiDelete<never>(`/api/payments/memberships/${creatorId}`)
  if (response.error) throw new ApiError(response.error, response.status, response.code, response.details)
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
