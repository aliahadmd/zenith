import Stripe from 'stripe'
import { getStripeSecretKey } from './config'
import type {
  CheckoutSessionInput,
  CheckoutSessionResult,
  ConnectedAccountSnapshot,
  ConnectedBalance,
  CreatePricesInput,
  PaymentProvider,
  PayoutSummary,
  ProviderPrice,
} from './types'

function createStripe(env: Env) {
  return new Stripe(getStripeSecretKey(env), {
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
  const cardPaymentsStatus = account.configuration?.merchant?.capabilities?.card_payments?.status
  const transfersStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status
  const payoutsStatus = account.configuration?.recipient?.capabilities?.stripe_balance?.payouts?.status
  const requirementsDue = [
    ...requirementEntriesDue(account.requirements?.entries),
    ...requirementEntriesDue(account.future_requirements?.entries),
  ]

  const chargesEnabled = cardPaymentsStatus === 'active'
  const payoutsEnabled = payoutsStatus === 'active' || transfersStatus === 'active'
  const detailsSubmitted = requirementsDue.length === 0 && account.applied_configurations.includes('merchant')
  const status =
    chargesEnabled && payoutsEnabled
      ? 'active'
      : detailsSubmitted || requirementsDue.length > 0
        ? 'restricted'
        : 'onboarding'

  return {
    provider: 'stripe',
    providerAccountId: account.id,
    status,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    requirementsDue,
  }
}

function firstCurrencyAmount(
  amounts: Array<{ amount: number; currency: string }>,
  currency = 'usd',
) {
  return amounts.find((item) => item.currency === currency)?.amount ?? amounts[0]?.amount ?? 0
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe' as const

  constructor(private readonly env: Env) {}

  private stripe() {
    return createStripe(this.env)
  }

  async createConnectedAccount(input: {
    creatorId: string
    email: string
    displayName: string
  }): Promise<ConnectedAccountSnapshot> {
    const account = await this.stripe().v2.core.accounts.create({
      contact_email: input.email,
      display_name: input.displayName,
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
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
        recipient: {
          capabilities: {
            stripe_balance: {
              stripe_transfers: { requested: true },
            },
          },
        },
      },
      include: ['configuration.merchant', 'configuration.recipient', 'defaults', 'future_requirements', 'requirements'],
      metadata: {
        creatorId: input.creatorId,
      },
    })

    return mapAccount(account)
  }

  async retrieveConnectedAccount(providerAccountId: string): Promise<ConnectedAccountSnapshot> {
    return mapAccount(await this.stripe().v2.core.accounts.retrieve(providerAccountId, {
      include: ['configuration.merchant', 'configuration.recipient', 'defaults', 'future_requirements', 'requirements'],
    }))
  }

  async createOnboardingLink(input: {
    providerAccountId: string
    refreshUrl: string
    returnUrl: string
  }): Promise<{ url: string }> {
    const link = await this.stripe().v2.core.accountLinks.create({
      account: input.providerAccountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: {
          configurations: ['merchant', 'recipient'],
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
    const link = await this.stripe().accounts.createLoginLink(providerAccountId)
    return { url: link.url }
  }

  async createPrices(input: CreatePricesInput): Promise<ProviderPrice[]> {
    const stripe = this.stripe()
    const product = await stripe.products.create({
      name: `${input.displayName} ${input.planName}`,
      description: input.description,
      metadata: {
        creatorId: input.creatorId,
      },
    })

    const [monthly, yearly] = await Promise.all([
      stripe.prices.create({
        product: product.id,
        unit_amount: input.monthlyAmountCents,
        currency: input.currency,
        recurring: { interval: 'month' },
        metadata: {
          creatorId: input.creatorId,
          interval: 'monthly',
        },
      }),
      stripe.prices.create({
        product: product.id,
        unit_amount: input.yearlyAmountCents,
        currency: input.currency,
        recurring: { interval: 'year' },
        metadata: {
          creatorId: input.creatorId,
          interval: 'yearly',
        },
      }),
    ])

    return [
      {
        interval: 'monthly',
        providerProductId: product.id,
        providerPriceId: monthly.id,
        amountCents: input.monthlyAmountCents,
        currency: input.currency,
      },
      {
        interval: 'yearly',
        providerProductId: product.id,
        providerPriceId: yearly.id,
        amountCents: input.yearlyAmountCents,
        currency: input.currency,
      },
    ]
  }

  async createCustomer(input: { userId: string; email: string; displayName: string }) {
    const customer = await this.stripe().customers.create({
      email: input.email,
      name: input.displayName,
      metadata: {
        userId: input.userId,
      },
    })

    return { id: customer.id }
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
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
        creatorId: input.creatorId,
        subscriberId: input.subscriberId,
        interval: input.interval,
      },
      subscription_data: {
        application_fee_percent: feePercent,
        transfer_data: {
          destination: input.connectedAccountId,
        },
        metadata: {
          membershipId: input.membershipId,
          creatorId: input.creatorId,
          subscriberId: input.subscriberId,
          interval: input.interval,
        },
      },
    })

    return {
      id: session.id,
      url: session.url ?? '',
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : undefined,
    }
  }

  async retrieveBalance(providerAccountId: string): Promise<ConnectedBalance> {
    const balance = await this.stripe().balance.retrieve(undefined, { stripeAccount: providerAccountId })
    return {
      availableCents: firstCurrencyAmount(balance.available),
      pendingCents: firstCurrencyAmount(balance.pending),
      currency: balance.available[0]?.currency ?? balance.pending[0]?.currency ?? 'usd',
    }
  }

  async listPayouts(providerAccountId: string): Promise<PayoutSummary[]> {
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
