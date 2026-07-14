export class PaymentConfigurationError extends Error {
  constructor(message = 'Payment provider is not configured') {
    super(message)
    this.name = 'PaymentConfigurationError'
  }
}

type PaymentEnv = Env & {
  STRIPE_API_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
  STRIPE_MODE?: string
  STRIPE_ACCOUNT_ID?: string
  PAYMENT_PROVIDER?: string
  PLATFORM_FEE_BPS?: string
}

export function getConfiguredPaymentProvider(env: Env) {
  return ((env as PaymentEnv).PAYMENT_PROVIDER ?? 'stripe').toLowerCase()
}

export function getPlatformFeeBps(env: Env) {
  const raw = (env as PaymentEnv).PLATFORM_FEE_BPS ?? '1000'
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < 0 || value > 10_000) return 1000
  return value
}

export function getStripeApiKey(env: Env) {
  const key = (env as PaymentEnv).STRIPE_API_KEY
  if (!key) throw new PaymentConfigurationError('Stripe sandbox API key is not configured')
  if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
    throw new PaymentConfigurationError('Zenith only accepts Stripe sandbox API keys')
  }
  return key
}

export function getStripeMode(env: Env) {
  const mode = ((env as PaymentEnv).STRIPE_MODE ?? '').toLowerCase()
  if (mode !== 'test') throw new PaymentConfigurationError('STRIPE_MODE must be test')
  return mode
}

export function getExpectedStripeAccountId(env: Env) {
  const accountId = (env as PaymentEnv).STRIPE_ACCOUNT_ID?.trim()
  if (!accountId?.startsWith('acct_')) {
    throw new PaymentConfigurationError('Expected Stripe sandbox account ID is not configured')
  }
  return accountId
}

export function getStripeWebhookSecret(env: Env) {
  const secret = (env as PaymentEnv).STRIPE_WEBHOOK_SECRET
  if (!secret) throw new PaymentConfigurationError('Stripe webhook secret is not configured')
  return secret
}

export function getStripeSandboxConfiguration(env: Env) {
  const mode = getStripeMode(env)
  const accountId = getExpectedStripeAccountId(env)
  getStripeApiKey(env)
  getStripeWebhookSecret(env)
  return { configured: true as const, mode, accountId }
}
