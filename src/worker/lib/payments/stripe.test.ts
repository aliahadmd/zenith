import { afterEach, describe, expect, it, vi } from 'vitest'
import { StripePaymentProvider } from './stripe'

describe('StripePaymentProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('verifies the platform through Stripe current-account lookup', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      id: 'acct_expected',
      object: 'account',
      livemode: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const provider = new StripePaymentProvider({
      STRIPE_API_KEY: 'sk_test_secret',
      STRIPE_MODE: 'test',
      STRIPE_ACCOUNT_ID: 'acct_expected',
    } as unknown as Env)

    await expect(provider.verifySandboxConfiguration()).resolves.toEqual({
      accountId: 'acct_expected',
      sandbox: true,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.stripe.com/v1/account')
  })

  it('creates USD sandbox recipients with a matching test country', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'acct_expected',
        object: 'account',
        livemode: false,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'acct_connected',
        object: 'v2.core.account',
        applied_configurations: ['recipient'],
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                payouts: { status: 'inactive' },
                stripe_transfers: { status: 'inactive' },
              },
            },
          },
        },
        future_requirements: { entries: [] },
        requirements: { entries: [] },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const provider = new StripePaymentProvider({
      STRIPE_API_KEY: 'sk_test_secret',
      STRIPE_MODE: 'test',
      STRIPE_ACCOUNT_ID: 'acct_expected',
    } as unknown as Env)

    await expect(provider.createConnectedAccount({ creatorId: 'creator-id' })).resolves.toMatchObject({
      providerAccountId: 'acct_connected',
      sandbox: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const request = fetchMock.mock.calls[1]
    expect(request?.[0]).toBe('https://api.stripe.com/v2/core/accounts')
    expect(JSON.parse(String(request?.[1]?.body))).toMatchObject({
      defaults: { currency: 'usd' },
      identity: { country: 'us' },
    })
  })
})
