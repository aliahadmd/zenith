export class PaymentConfigurationError extends Error {
  constructor(message = 'Payment provider is not configured') {
    super(message)
    this.name = 'PaymentConfigurationError'
  }
}

type PaymentEnv = Env & {
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
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

export function getStripeSecretKey(env: Env) {
  const key = (env as PaymentEnv).STRIPE_SECRET_KEY
  if (!key) throw new PaymentConfigurationError('Stripe test secret key is not configured')
  return key
}

export function getStripeWebhookSecret(env: Env) {
  const secret = (env as PaymentEnv).STRIPE_WEBHOOK_SECRET
  if (!secret) throw new PaymentConfigurationError('Stripe webhook secret is not configured')
  return secret
}

