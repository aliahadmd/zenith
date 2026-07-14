import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionsPage } from './SubscriptionsPage'
import * as api from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof api>()
  return { ...actual, apiGetRequired: vi.fn(), apiPutRequired: vi.fn(), apiPostRequired: vi.fn() }
})

vi.mock('../components/StudioLayout', () => ({
  StudioLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}))

const mockGet = vi.mocked(api.apiGetRequired)

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><SubscriptionsPage /></QueryClientProvider>)
}

describe('SubscriptionsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue({
      plan: {
        id: 'plan-1',
        name: 'Membership',
        description: '',
        currency: 'usd',
        mode: 'free_permanent',
        revision: 1,
        freeTrialDays: null,
        sandbox: true,
        prices: { monthly: null, yearly: null },
      },
      account: {
        provider: 'stripe',
        providerAccountId: 'acct_test',
        status: 'active',
        transfersEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsDue: [],
        connected: true,
        sandbox: true,
      },
      transitions: {},
    })
  })

  it('renders only fields relevant to the selected membership mode', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await screen.findByRole('radio', { name: /free permanent/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByLabelText('Trial length')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Monthly price')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /timed free trial/i }))
    expect(screen.getByLabelText('Trial length')).toBeInTheDocument()
    expect(screen.queryByLabelText('Monthly price')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /paid membership/i }))
    expect(screen.queryByLabelText('Trial length')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Monthly price')).toBeInTheDocument()
    expect(screen.getByLabelText(/annual price/i)).toBeInTheDocument()
    expect(screen.getByText(/4242 4242 4242 4242/)).toBeInTheDocument()
  })

  it('requires confirmation before changing the active mode', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('radio', { name: /free permanent/i })
    await user.click(screen.getByRole('radio', { name: /disabled/i }))
    await user.click(screen.getByRole('button', { name: 'Save membership' }))
    expect(await screen.findByRole('heading', { name: 'Change membership mode?' })).toBeInTheDocument()
  })
})
