export type PaymentProviderName = 'stripe'
export type InternalProviderName = 'internal'
export type MembershipInterval = 'monthly' | 'yearly'
export type ConnectedAccountStatus = 'not_connected' | 'onboarding' | 'active' | 'restricted'

export type ConnectedAccountSnapshot = {
  provider: PaymentProviderName
  providerAccountId: string
  status: ConnectedAccountStatus
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
}

export type ProviderPrice = {
  interval: MembershipInterval
  providerProductId: string
  providerPriceId: string
  amountCents: number
  currency: string
}

export type CreatePricesInput = {
  creatorId: string
  displayName: string
  planName: string
  description?: string
  monthlyAmountCents: number
  yearlyAmountCents: number
  currency: 'usd'
}

export type CheckoutSessionInput = {
  membershipId: string
  creatorId: string
  subscriberId: string
  customerId: string
  connectedAccountId: string
  priceId: string
  interval: MembershipInterval
  successUrl: string
  cancelUrl: string
  platformFeeBps: number
}

export type CheckoutSessionResult = {
  id: string
  url: string
  subscriptionId?: string
}

export type ConnectedBalance = {
  availableCents: number
  pendingCents: number
  currency: string
}

export type PayoutSummary = {
  id: string
  amountCents: number
  currency: string
  status: string
  arrivalDate: number | null
  createdAt: number
}

export interface PaymentProvider {
  readonly name: PaymentProviderName
  createConnectedAccount(input: {
    creatorId: string
    email: string
    displayName: string
  }): Promise<ConnectedAccountSnapshot>
  retrieveConnectedAccount(providerAccountId: string): Promise<ConnectedAccountSnapshot>
  createOnboardingLink(input: {
    providerAccountId: string
    refreshUrl: string
    returnUrl: string
  }): Promise<{ url: string }>
  createDashboardLink(providerAccountId: string): Promise<{ url: string }>
  createPrices(input: CreatePricesInput): Promise<ProviderPrice[]>
  createCustomer(input: { userId: string; email: string; displayName: string }): Promise<{ id: string }>
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>
  retrieveBalance(providerAccountId: string): Promise<ConnectedBalance>
  listPayouts(providerAccountId: string): Promise<PayoutSummary[]>
}

