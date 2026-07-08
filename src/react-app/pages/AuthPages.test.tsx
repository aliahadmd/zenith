import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import * as AuthContext from '../context/AuthContext'
import * as authApi from '../lib/auth'

const navigateMock = vi.fn()
const completeOtpSignInMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    className,
    children,
  }: {
    to: string
    className?: string
    children: ReactNode
  }) => <a href={to} className={className}>{children}</a>,
  useNavigate: () => navigateMock,
}))

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof AuthContext>()
  return {
    ...actual,
    useAuth: vi.fn(),
  }
})

vi.mock('../lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof authApi>()
  return {
    ...actual,
    requestOtp: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(AuthContext.useAuth)
const mockRequestOtp = vi.mocked(authApi.requestOtp)

describe('passwordless auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => document.activeElement ?? document.body),
    })
    mockRequestOtp.mockResolvedValue({ success: true })
    completeOtpSignInMock.mockResolvedValue({
      error: null,
      user: {
        id: 'user-1',
        email: 'reader@example.com',
        role: 'subscriber',
        displayName: 'Reader',
        username: 'reader',
      },
    })
    mockUseAuth.mockReturnValue({
      currentUser: null,
      isLoading: false,
      completeOtpSignIn: completeOtpSignInMock,
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  it('shows login email and OTP steps without password fields', async () => {
    const user = userEvent.setup()
    renderWithClient(<LoginPage />)

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: /send sign-in code/i }))

    await screen.findByText(/enter the code sent to reader@example.com/i)
    expect(screen.getByText(/verification code/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('shows register OTP step without password fields', async () => {
    const user = userEvent.setup()
    renderWithClient(<RegisterPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: /send verification code/i }))

    await screen.findByText(/enter the code sent to reader@example.com/i)
    expect(screen.getByText(/verification code/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('submits the typed register OTP code', async () => {
    const user = userEvent.setup()
    renderWithClient(<RegisterPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: /send verification code/i }))

    await screen.findByText(/enter the code sent to reader@example.com/i)
    const slots = otpSlots()
    expect(slots).toHaveLength(6)

    await user.click(slots[0])
    expect(slots[0]).toHaveFocus()
    await user.keyboard('123456')
    await waitFor(() => {
      expect(otpSlotValue()).toBe('123456')
    })
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(completeOtpSignInMock).toHaveBeenCalledWith('reader@example.com', '123456')
    })
  })
})

function otpSlotValue() {
  return otpSlots()
    .map((input) => input.value)
    .join('')
}

function otpSlots() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('[data-input-otp]'))
}

function renderWithClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  )
}
