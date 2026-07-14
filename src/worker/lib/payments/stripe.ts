import Stripe from 'stripe'
import { getExpectedStripeAccountId, getStripeApiKey, getStripeMode, PaymentConfigurationError } from './config'
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  ConnectedAccountSnapshot,
  ConnectedBalance,
  PaymentProvider,
  PayoutSummary,
  PriceInput,
  ProviderPrice,
  ProductInput,
} from './types'

function createStripe(env: Env) {
  return new Stripe(getStripeApiKey(env), {
    httpClient: Stripe.createFetchHttpClient(),
    telemetry: false,
  })
}

function requirementEntriesDue(
  entries: Array<{
    description?: string
    minimum_deadline?: { status?: string }
    reference?: { resource?: string; inquiry?: string; type?: string }
  }> = [],
) {
  return entries
    .filter((entry) => entry.minimum_deadline?.status === 'currently_due' || entry.minimum_deadline?.status === 'past_due')
    .map((entry) => entry.reference?.resource ?? entry.reference?.inquiry ?? entry.description)
    .filter((item): item is string => Boolean(item))
}

function mapAccount(account: Stripe.V2.Core.Account): ConnectedAccountSnapshot {
  const transfersStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status
  const payoutsStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status
  const requirementsDue = [
    ...requirementEntriesDue(account.requirements?.entries),
    ...requirementEntriesDue(account.future_requirements?.entries),
  ]

  const transfersEnabled = transfersStatus === 'active'
  const payoutsEnabled = payoutsStatus === 'active'
  const detailsSubmitted = requirementsDue.length === 0 && account.applied_configurations.includes('recipient')
  const status =
    transfersEnabled && payoutsEnabled && detailsSubmitted
      ? 'active'
      : detailsSubmitted || requirementsDue.length > 0
        ? 'restricted'
        : 'onboarding'

  return {
    provider: 'stripe',
    providerAccountId: account.id,
    status,
    transfersEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDue,
    sandbox: true,
  }
}

function firstCurrencyAmount(
  amounts: Array<{ amount: number; currency: string }>,
  currency = 'usd',
) {
  return amounts.find((item) => item.currency === currency)?.amount ?? amounts[0]?.amount ?? 0
}

async function syntheticToken(value: string) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 24)
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const

  constructor(private readonly env: Env) {}

  private platformVerification?: Promise<{ accountId: string; sandbox: true }>

  private stripe() {
    return createStripe(this.env)
  }

  verifySandboxConfiguration() {
    if (!this.platformVerification) {
      this.platformVerification = this.verifyPlatformAccount()
    }
    return this.platformVerification
  }

  private async verifyPlatformAccount() {
    getStripeMode(this.env)
    const expectedAccountId = getExpectedStripeAccountId(this.env)
    const account = await this.stripe().accounts.retrieveCurrent()
    if (account.id !== expectedAccountId) {
      throw new PaymentConfigurationError('Stripe API key belongs to an unexpected sandbox account')
    }
    return { accountId: account.id, sandbox: true as const }
  }

  async createConnectedAccount(input: {
    creatorId: string
  }): Promise<ConnectedAccountSnapshot> {
    await this.verifySandboxConfiguration()
    const identity = await syntheticToken(input.creatorId)
    const account = await this.stripe().v2.core.accounts.create({
      contact_email: `creator-${identity}@noreply.aliahad.com`,
      display_name: `Zenith test creator ${identity.slice(0, 8)}`,
      dashboard: 'express',
      defaults: {
        currency: 'usd',
        profile: {
          product_description: 'Creator membership subscriptions',
        },
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      identity: {
        country: 'us',
      },
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      include: ['configuration.recipient', 'defaults', 'future_requirements', 'requirements'],
      metadata: {
        zenithIdentity: identity,
      },
    })

    return mapAccount(account)
  }

  async retrieveConnectedAccount(providerAccountId: string): Promise<ConnectedAccountSnapshot> {
    await this.verifySandboxConfiguration()
    return mapAccount(await this.stripe().v2.core.accounts.retrieve(providerAccountId, {
      include: ['configuration.recipient', 'defaults', 'future_requirements', 'requirements'],
    }))
  }

  async createOnboardingLink(input: {
    providerAccountId: string
    refreshUrl: string
    returnUrl: string
  }): Promise<{ url: string }> {
    await this.verifySandboxConfiguration()
    const link = await this.stripe().v2.core.accountLinks.create({
      account: input.providerAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['recipient'],
          refresh_url: input.refreshUrl,
          return_url: input.returnUrl,
          collection_options: {
            fields: 'eventually_due',
            future_requirements: 'include',
          },
        },
      },
    })

    return { url: link.url }
  }

  async createDashboardLink(providerAccountId: string): Promise<{ url: string }> {
    await this.verifySandboxConfiguration()
    const link = await this.stripe().accounts.createLoginLink(providerAccountId)
    return { url: link.url }
  }

  async upsertProduct(input: ProductInput): Promise<{ id: string }> {
    await this.verifySandboxConfiguration()
    const stripe = this.stripe()
    if (input.productId) {
      const product = await stripe.products.update(input.productId, {
        name: input.planName,
        description: input.description || null,
        metadata: {
          revision: String(input.revision),
        },
      }, { idempotencyKey: `zenith-product-${input.creatorId}-${input.revision}` })
      return { id: product.id }
    }

    const product = await stripe.products.create({
      name: input.planName,
      description: input.description,
      metadata: {
        revision: String(input.revision),
      },
    }, { idempotencyKey: `zenith-product-${input.creatorId}-${input.revision}` })
    return { id: product.id }
  }

  async createPrice(input: PriceInput): Promise<ProviderPrice> {
    await this.verifySandboxConfiguration()
    const price = await this.stripe().prices.create({
      product: input.productId,
      unit_amount: input.amountCents,
      currency: input.currency,
      recurring: { interval: input.interval === 'monthly' ? 'month' : 'year' },
      metadata: {
        planId: input.planId,
        interval: input.interval,
        revision: String(input.revision),
      },
    }, { idempotencyKey: `zenith-price-${input.planId}-${input.interval}-${input.revision}` })

    return {
      interval: input.interval,
      providerProductId: input.productId,
      providerPriceId: price.id,
      amountCents: input.amountCents,
      currency: input.currency,
    }
  }

  async archivePrice(providerPriceId: string) {
    await this.verifySandboxConfiguration()
    await this.stripe().prices.update(providerPriceId, { active: false })
  }

  async createCustomer(input: { userId: string }) {
    await this.verifySandboxConfiguration()
    const identity = await syntheticToken(input.userId)
    const customer = await this.stripe().customers.create({
      email: `member-${identity}@noreply.aliahad.com`,
      name: `Zenith test member ${identity.slice(0, 8)}`,
      metadata: {
        zenithIdentity: identity,
      },
    }, { idempotencyKey: `zenith-customer-${identity}` })

    return { id: customer.id }
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    await this.verifySandboxConfiguration()
    const feePercent = input.platformFeeBps / 100
    const session = await this.stripe().checkout.sessions.create({
      mode: 'subscription',
      customer: input.customerId,
      client_reference_id: input.membershipId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: {
        membershipId: input.membershipId,
        interval: input.interval,
        planPriceId: input.planPriceId,
      },
      subscription_data: {
        application_fee_percent: feePercent,
        transfer_data: {
          destination: input.connectedAccountId,
        },
        metadata: {
          membershipId: input.membershipId,
          interval: input.interval,
          planPriceId: input.planPriceId,
        },
      },
    }, { idempotencyKey: input.idempotencyKey })

    return {
      id: session.id,
      url: session.url ?? '',
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
    }
  }

  async createCustomerPortalSession(input: { customerId: string; returnUrl: string }) {
    await this.verifySandboxConfiguration()
    const session = await this.stripe().billingPortal.sessions.create({
      customer: input.customerId,
      return_url: input.returnUrl,
    })
    return { url: session.url }
  }

  async cancelSubscriptionAtPeriodEnd(providerSubscriptionId: string) {
    await this.verifySandboxConfiguration()
    const subscription = await this.stripe().subscriptions.update(providerSubscriptionId, { cancel_at_period_end: true })
    return {
      cancelAt: subscription.cancel_at ?? subscription.items.data[0]?.current_period_end ?? null,
    }
  }

  async retrieveBalance(providerAccountId: string): Promise<ConnectedBalance> {
    await this.verifySandboxConfiguration()
    const balance = await this.stripe().balance.retrieve(undefined, { stripeAccount: providerAccountId })
    return {
      availableCents: firstCurrencyAmount(balance.available),
      pendingCents: firstCurrencyAmount(balance.pending),
      currency: balance.available[0]?.currency ?? balance.pending[0]?.currency ?? 'usd',
    }
  }

  async listPayouts(providerAccountId: string): Promise<PayoutSummary[]> {
    await this.verifySandboxConfiguration()
    const payouts = await this.stripe().payouts.list({ limit: 5 }, { stripeAccount: providerAccountId })
    return payouts.data.map((payout) => ({
      id: payout.id,
      amountCents: payout.amount,
      currency: payout.currency,
      status: payout.status,
      arrivalDate: payout.arrival_date ?? null,
      createdAt: payout.created,
    }))
  }
}

export async function constructStripeWebhookEvent(env: Env, payload: string, signature: string, secret: string) {
  return createStripe(env).webhooks.constructEventAsync(
    payload,
    signature,
    secret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  )
}
