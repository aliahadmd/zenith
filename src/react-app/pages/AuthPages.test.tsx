import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

vi.mock('input-otp', async () => {
  const React = await import('react')
  const OTPInputContext = React.createContext({
    slots: Array.from({ length: 6 }, () => ({
      char: '',
      hasFakeCaret: false,
      isActive: false,
    })),
  })

  return {
    OTPInputContext,
    OTPInput: ({
      children,
      value,
      onChange,
      maxLength = 6,
    }: {
      children: ReactNode
      value?: string
      onChange?: (value: string) => void
      maxLength?: number
    }) => {
      const slots = Array.from({ length: maxLength }, (_, index) => ({
        char: value?.[index] ?? '',
        hasFakeCaret: false,
        isActive: false,
      }))
      return (
        <OTPInputContext.Provider value={{ slots }}>
          <input
            aria-label="Verification code"
            value={value ?? ''}
            onChange={(event) => onChange?.(event.target.value)}
          />
          {children}
        </OTPInputContext.Provider>
      )
    },
  }
})

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
})

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
