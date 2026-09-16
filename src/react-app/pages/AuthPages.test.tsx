import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { LoginPage } from './LoginPage'
import { RegisterPage } from './RegisterPage'
import * as AuthContext from '../context/AuthContext'
import * as authApi from '../lib/auth'

const navigateMock = vi.fn()
const completePasswordSignInMock = vi.fn()
const useSearchMock = vi.fn(() => ({}))

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
  useSearch: () => useSearchMock(),
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
    registerRequest: vi.fn(),
    resendVerificationRequest: vi.fn(),
    forgotPasswordRequest: vi.fn(),
    resetPasswordRequest: vi.fn(),
  }
})

const mockUseAuth = vi.mocked(AuthContext.useAuth)
const mockRegisterRequest = vi.mocked(authApi.registerRequest)
const mockResendVerificationRequest = vi.mocked(authApi.resendVerificationRequest)
const mockForgotPasswordRequest = vi.mocked(authApi.forgotPasswordRequest)
const mockResetPasswordRequest = vi.mocked(authApi.resetPasswordRequest)

describe('password auth pages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSearchMock.mockReturnValue({})
    mockRegisterRequest.mockResolvedValue({ success: true, email: 'reader@example.com' })
    mockResendVerificationRequest.mockResolvedValue({ success: true })
    mockForgotPasswordRequest.mockResolvedValue({ success: true })
    mockResetPasswordRequest.mockResolvedValue({ success: true })
    completePasswordSignInMock.mockResolvedValue({
      error: null,
      code: null,
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
      completePasswordSignIn: completePasswordSignInMock,
      logout: vi.fn(),
      refreshCurrentUser: vi.fn(),
    })
  })

  it('signs in with an email and password', async () => {
    const user = userEvent.setup()
    renderWithClient(<LoginPage />)

    expect(screen.queryByText(/sign-in code/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password-123')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(completePasswordSignInMock).toHaveBeenCalledWith('reader@example.com', 'password-123')
    })
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/feed' })
    })
  })

  it('offers a verification resend after an unverified sign-in attempt', async () => {
    const user = userEvent.setup()
    completePasswordSignInMock.mockResolvedValue({
      error: 'Verify your email before signing in.',
      code: 'email_not_verified',
      user: null,
    })
    renderWithClient(<LoginPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password-123')
    await user.click(screen.getByRole('button', { name: /^sign in$/i }))

    await screen.findByText(/verify reader@example.com before signing in/i)
    await user.click(screen.getByRole('button', { name: /resend verification email/i }))

    await screen.findByText(/verification email sent/i)
    expect(mockResendVerificationRequest).toHaveBeenCalledWith({ email: 'reader@example.com' }, expect.anything())
  })

  it('registers with a password and shows the verification inbox step', async () => {
    const user = userEvent.setup()
    renderWithClient(<RegisterPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password-123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password-123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockRegisterRequest).toHaveBeenCalledWith({ email: 'reader@example.com', password: 'password-123' }, expect.anything())
    })
    await screen.findByText(/check your inbox/i)
    expect(screen.getByText(/we sent a verification link to reader@example.com/i)).toBeInTheDocument()
  })

  it('rejects mismatched register passwords without submitting', async () => {
    const user = userEvent.setup()
    renderWithClient(<RegisterPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.type(screen.getByLabelText(/^password/i), 'password-123')
    await user.type(screen.getByLabelText(/confirm password/i), 'password-456')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await screen.findByText(/passwords do not match/i)
    expect(mockRegisterRequest).not.toHaveBeenCalled()
  })

  it('sends a reset link from the forgot password page', async () => {
    const user = userEvent.setup()
    renderWithClient(<ForgotPasswordPage />)

    await user.type(screen.getByLabelText(/email/i), 'reader@example.com')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(mockForgotPasswordRequest).toHaveBeenCalledWith({ email: 'reader@example.com' }, expect.anything())
    })
    await screen.findByText(/check your inbox/i)
  })

  it('submits a new password through the reset page', async () => {
    const user = userEvent.setup()
    useSearchMock.mockReturnValue({ token: 'reset-token-1' })
    const { ResetPasswordPage } = await import('./ResetPasswordPage')
    renderWithClient(<ResetPasswordPage />)

    await user.type(screen.getByLabelText(/^new password/i), 'new-password-1')
    await user.type(screen.getByLabelText(/confirm new password/i), 'new-password-1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => {
      expect(mockResetPasswordRequest).toHaveBeenCalledWith({
        token: 'reset-token-1',
        password: 'new-password-1',
        confirmPassword: 'new-password-1',
      }, expect.anything())
    })
    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({ to: '/login', search: { reset: '1' }, replace: true })
    })
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
