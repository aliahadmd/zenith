export type PaymentProviderName = 'stripe'
export type InternalProviderName = 'internal'
export type MembershipInterval = 'monthly' | 'yearly'
export type ConnectedAccountStatus = 'not_connected' | 'onboarding' | 'active' | 'restricted'

export type ConnectedAccountSnapshot = {
  provider: PaymentProviderName
  providerAccountId: string
  status: ConnectedAccountStatus
  transfersEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  requirementsDue: string[]
  sandbox: true
}

export type ProviderPrice = {
  interval: MembershipInterval
  providerProductId: string
  providerPriceId: string
  amountCents: number
  currency: string
}

export type ProductInput = {
  creatorId: string
  productId?: string | null
  planName: string
  description?: string
  revision: number
}

export type PriceInput = {
  creatorId: string
  planId: string
  productId: string
  interval: MembershipInterval
  amountCents: number
  currency: 'usd'
  revision: number
}

export type CheckoutSessionInput = {
  membershipId: string
  creatorId: string
  subscriberId: string
  customerId: string
  connectedAccountId: string
  priceId: string
  planPriceId: string
  interval: MembershipInterval
  successUrl: string
  cancelUrl: string
  platformFeeBps: number
  idempotencyKey: string
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
  verifySandboxConfiguration(): Promise<{ accountId: string; sandbox: true }>
  createConnectedAccount(input: {
    creatorId: string
  }): Promise<ConnectedAccountSnapshot>
  retrieveConnectedAccount(providerAccountId: string): Promise<ConnectedAccountSnapshot>
  createOnboardingLink(input: {
    providerAccountId: string
    refreshUrl: string
    returnUrl: string
  }): Promise<{ url: string }>
  createDashboardLink(providerAccountId: string): Promise<{ url: string }>
  upsertProduct(input: ProductInput): Promise<{ id: string }>
  createPrice(input: PriceInput): Promise<ProviderPrice>
  archivePrice(providerPriceId: string): Promise<void>
  createCustomer(input: { userId: string }): Promise<{ id: string }>
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>
  createCustomerPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>
  cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string): Promise<{ cancelAt: number | null }>
  retrieveBalance(providerAccountId: string): Promise<ConnectedBalance>
  listPayouts(providerAccountId: string): Promise<PayoutSummary[]>
}
