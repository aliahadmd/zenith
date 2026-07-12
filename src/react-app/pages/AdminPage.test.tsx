import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminPage } from './AdminPage'
import * as AuthContext from '../context/AuthContext'
import * as api from '../lib/api'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return { ...actual, useAuth: vi.fn() }
})

vi.mock('../lib/api', () => ({
  apiGetRequired: vi.fn(),
  apiPostRequired: vi.fn(),
  apiDeleteRequired: vi.fn(),
}))

const mockUseAuth = vi.mocked(AuthContext.useAuth)
const mockApiGet = vi.mocked(api.apiGetRequired)

function renderAdmin(section: Parameters<typeof AdminPage>[0]['section'] = 'overview') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><AdminPage section={section} /></QueryClientProvider>)
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseAuth.mockReturnValue({
      currentUser: { id: 'owner-1', email: 'owner@example.com', displayName: 'Owner', username: 'owner', role: 'subscriber', adminRole: 'owner' },
      isLoading: false,
      completeOtpSignIn: vi.fn(),
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  it('renders operational overview counts and owner navigation', async () => {
    mockApiGet.mockResolvedValue({ counts: { users: 42, creators: 7, pendingApplications: 3, openReports: 2 } })
    renderAdmin()
    expect(await screen.findByText('42')).toBeInTheDocument()
    expect(screen.getByText('Pending applications')).toBeInTheDocument()
    expect(screen.getByText('Administrators')).toBeInTheDocument()
  })

  it('renders the paginated user queue with state filters and actions', async () => {
    mockApiGet.mockResolvedValue({
      items: [{ id: 'user-1', email: 'member@example.com', username: 'member', displayName: 'Member', role: 'subscriber', accountStatus: 'active', adminRole: null, createdAt: 1 }],
      page: 1,
      pageSize: 20,
      total: 1,
    })
    renderAdmin('users')
    expect(await screen.findByText(/member@example\.com/)).toBeInTheDocument()
    expect(screen.getByText('All states')).toBeInTheDocument()
    expect(screen.getByText('All personas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeInTheDocument()
  })
})
