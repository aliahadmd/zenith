---
kind: external_dependency
name: Stripe Payment Provider (Sandbox Only)
slug: stripe
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
source_files:
    - src/worker/lib/payments/stripe.ts
    - src/worker/lib/payments/config.ts
    - src/worker/routes/payments.ts
---

### Role
Handles creator monetization via subscriptions (memberships) and payouts.

### Integration Details
- **Vendor**: Stripe.
- **Constraint**: The application is hard-coded to **Sandbox/Test mode only**. `STRIPE_MODE` must be `test`, and API keys must start with `sk_test_`. Live production keys are rejected by configuration guards.
- **Features**:
  - **Connect Express**: Creators onboard via Stripe Express to receive payouts.
  - **Checkout**: Subscribers use Stripe Checkout for recurring subscriptions.
  - **Billing Portal**: Subscribers manage/cancel subscriptions via Stripe Billing Portal.
- **Verification**: The system verifies the connected Stripe account ID matches the expected sandbox account ID (`STRIPE_ACCOUNT_ID`) on initialization.