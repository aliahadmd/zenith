import { PaymentConfigurationError, getConfiguredPaymentProvider } from './config'
import { StripePaymentProvider } from './stripe'
import type { PaymentProvider } from './types'

export function createPaymentProvider(env: Env): PaymentProvider {
  const provider = getConfiguredPaymentProvider(env)
  if (provider === 'stripe') return new StripePaymentProvider(env)
  throw new PaymentConfigurationError(`Unsupported payment provider: ${provider}`)
}

export { PaymentConfigurationError, getPlatformFeeBps, getStripeWebhookSecret } from './config'
export type {
  ConnectedAccountSnapshot,
  ConnectedAccountStatus,
  InternalProviderName,
  MembershipInterval,
  PaymentProvider,
  PaymentProviderName,
} from './types'
